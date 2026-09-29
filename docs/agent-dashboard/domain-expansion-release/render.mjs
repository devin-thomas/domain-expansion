import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const folder = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(folder, 'status.json'), 'utf8'));
const localTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Chicago',
}).format(new Date(data.updated_at)) + ' America/Chicago';

const lines = [
  `# ${data.title}`,
  '',
  `**State:** ${data.overall_state} — ${data.phase}  `,
  `**Updated:** ${localTime}  `,
  `**Task ID:** \`${data.task_id}\`  `,
  `**Repository:** \`${data.repository.name}\`, branch \`${data.repository.branch}\`  `,
  `**Application commit:** \`${data.repository.application_commit}\``,
  '',
  '## Action required',
  '',
  `**${data.action_required.text}** ${data.action_required.reason}`,
  `Smallest action: ${data.action_required.smallest_user_action}`,
  '',
  '## Current activity',
  '',
  data.current_activity.operation,
  `Next checkpoint: ${data.current_activity.next_checkpoint}`,
  '',
  '## Milestones',
  '',
  ...data.milestones.map((item) => `- **${item.state.replaceAll('_', ' ')} — ${item.name}.** ${item.detail}`),
  '',
  '## Open gates',
  '',
  ...data.blockers.map((item) => `- ${item.cause} Impact: ${item.impact} Owner: ${item.owner}. Recovery: ${item.recovery_path} Independent work: ${item.independent_work}`),
  '',
  '## Watch items',
  '',
  ...data.warnings.map((item) => `- **${item.label}:** ${item.text}`),
  '',
  '## Decisions',
  '',
  ...data.decisions.map((item) => `- ${item.decision} ${item.rationale} Recorded ${item.timestamp}; ${item.status}; ${item.reversibility}`),
  '',
  '## Outputs',
  '',
  ...data.outputs.map((item) => `- [${item.name}](${item.path})`),
  '',
  '## Next up',
  '',
  ...data.next_up.map((item, index) => `${index + 1}. ${item}`),
  '',
  '## Activity log',
  '',
  ...data.activity_log.map((item) => `- ${item.timestamp}: ${item.event}`),
  '',
  '## Walk-away snapshot',
  '',
  `${data.walk_away.last_verified_good_state} Unfinished: ${data.walk_away.unfinished_operation} Next safe step: ${data.walk_away.exact_next_safe_step}`,
  `Touched: ${data.walk_away.touched_files_or_services} Expected processes: ${data.walk_away.expected_running_processes} User action: ${data.walk_away.user_action}`,
  '',
  '## Delivery',
  '',
  `${data.delivery.mode}. Tailscale: ${data.delivery.tailscale} Persistence: ${data.delivery.repository_persistence} Last verified: ${data.delivery.last_verified} Limitation: ${data.delivery.limitation}`,
  '',
];
writeFileSync(join(folder, 'STATUS.md'), lines.join('\n'));

const htmlPath = join(folder, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const embedded = JSON.stringify(data, null, 2).replaceAll('<', '\\u003c');
html = html.replace(/<meta name="dashboard-updated-at" content="[^"]*">/, `<meta name="dashboard-updated-at" content="${data.updated_at}">`);
html = html.replace(/<script id="dashboard-data" type="application\/json">[\s\S]*?<\/script>/, `<script id="dashboard-data" type="application/json">\n${embedded}\n  </script>`);
writeFileSync(htmlPath, html);
