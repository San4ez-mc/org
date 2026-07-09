import 'dotenv/config';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';

/**
 * Worker платформи: розповсюдження змін інструкцій, ре-індексація, сповіщення.
 * У I1 — каркас черги. Обробники додаються в I7 (розповсюдження) та I8.
 */
function redisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

const connection = redisConnection();

export const PROPAGATION_QUEUE = 'instruction-propagation';

export const propagationQueue = new Queue(PROPAGATION_QUEUE, { connection });

// Тип завдання розповсюдження (використовуватиметься в I7)
export interface PropagationJob {
  companyId: string;
  changedInstructionId: string;
  changedBy?: string;
}

const worker = new Worker<PropagationJob>(
  PROPAGATION_QUEUE,
  async (job) => {
    // TODO (I7): вектор-пошук пов'язаних інструкцій → формування proposals → сповіщення
    // eslint-disable-next-line no-console
    console.log(`[worker] отримано завдання розповсюдження`, job.data);
  },
  { connection },
);

worker.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log('[worker] готовий, черга:', PROPAGATION_QUEUE);
});

worker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error(`[worker] завдання ${job?.id} впало:`, err);
});
