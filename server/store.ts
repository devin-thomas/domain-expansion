export interface StoredDoc<T = unknown> {
  path: string;
  data: T;
}

export interface Tx {
  get<T = unknown>(path: string): Promise<T | null>;
  set(path: string, value: unknown): void;
  delete(path: string): void;
}

export interface DocStore {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  get<T = unknown>(path: string): Promise<T | null>;
  list<T = unknown>(prefix: string): Promise<StoredDoc<T>[]>;
}

export class MemoryStore implements DocStore {
  private docs = new Map<string, string>();
  private chain: Promise<unknown> = Promise.resolve();

  async get<T>(path: string): Promise<T | null> {
    const raw = this.docs.get(path);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async list<T>(prefix: string): Promise<StoredDoc<T>[]> {
    const out: StoredDoc<T>[] = [];
    for (const [path, raw] of this.docs) {
      if (!path.startsWith(prefix)) continue;
      out.push({ path, data: JSON.parse(raw) as T });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const snapshot = new Map(this.docs);
      const writes = new Map<string, string | null>();
      const tx: Tx = {
        async get<T>(path: string) {
          const raw = writes.has(path) ? writes.get(path) : snapshot.get(path);
          if (raw == null) return null;
          return JSON.parse(raw) as T;
        },
        set(path: string, value: unknown) {
          writes.set(path, JSON.stringify(value));
        },
        delete(path: string) {
          writes.set(path, null);
        },
      };
      const result = await fn(tx);
      for (const [path, raw] of writes) {
        if (raw == null) this.docs.delete(path);
        else this.docs.set(path, raw);
      }
      return result;
    };
    const next = this.chain.then(run, run);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export async function createFirestoreStore(): Promise<DocStore> {
  const admin = await import('firebase-admin');
  if (admin.apps.length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-domain-expansion';
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json) as Record<string, string>), projectId });
    } else {
      admin.initializeApp({ projectId });
    }
  }
  const db = admin.firestore();
  return {
    async get<T>(path: string) {
      const snap = await db.doc(path).get();
      return snap.exists ? (snap.data() as T) : null;
    },
    async list<T>(prefix: string) {
      if (prefix === 'users/') {
        const snap = await db.collectionGroup('privateCredentials').get();
        return snap.docs
          .filter((doc) => doc.id === 'gemini' && doc.ref.path.startsWith('users/'))
          .map((doc) => ({ path: doc.ref.path, data: doc.data() as T }));
      }
      const collectionPath = prefix.replace(/\/$/, '');
      const snap = await db.collection(collectionPath).get();
      return snap.docs.map((doc) => ({ path: doc.ref.path, data: doc.data() as T }));
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>) {
      return db.runTransaction(async (transaction) => {
        const tx: Tx = {
          async get<T>(path: string) {
            const snap = await transaction.get(db.doc(path));
            return snap.exists ? (snap.data() as T) : null;
          },
          set(path: string, value: unknown) {
            transaction.set(db.doc(path), value as FirebaseFirestore.DocumentData);
          },
          delete(path: string) {
            transaction.delete(db.doc(path));
          },
        };
        return fn(tx);
      });
    },
  };
}
