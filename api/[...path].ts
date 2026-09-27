import { createDeps } from '../server/createApp';
import { handleApi } from '../server/http';

let depsPromise: ReturnType<typeof createDeps> | undefined;

export default async function handler(request: import('http').IncomingMessage, response: import('http').ServerResponse) {
  depsPromise ??= createDeps();
  await handleApi(request, response, await depsPromise);
}
