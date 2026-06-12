/**
 * Minimal worker pool: one job per worker at a time, callers check capacity
 * before submitting. Job scheduling/prioritization lives in the World, not
 * here — the pool only routes messages.
 */
import type { WorkerJob, WorkerRequest, WorkerResponse } from './protocol';

type ResponseHandler = (res: WorkerResponse) => void;

export class WorkerPool {
  private readonly idle: Worker[] = [];
  private readonly busyOf = new Map<number, Worker>();
  private readonly handlers = new Map<number, ResponseHandler>();
  private nextId = 1;
  readonly size: number;

  constructor(createWorker: () => Worker, size: number) {
    this.size = size;
    for (let i = 0; i < size; i++) {
      const worker = createWorker();
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.complete(e.data);
      this.idle.push(worker);
    }
  }

  get inFlight(): number {
    return this.busyOf.size;
  }

  get hasIdle(): boolean {
    return this.idle.length > 0;
  }

  /** Submit a job; caller must have checked hasIdle. */
  submit(job: WorkerJob, transfer: ArrayBuffer[], onDone: ResponseHandler): void {
    const worker = this.idle.pop();
    if (!worker) throw new Error('WorkerPool.submit called with no idle worker');
    const id = this.nextId++;
    const message: WorkerRequest = { ...job, id };
    this.busyOf.set(id, worker);
    this.handlers.set(id, onDone);
    worker.postMessage(message, transfer);
  }

  private complete(res: WorkerResponse): void {
    const worker = this.busyOf.get(res.id);
    const handler = this.handlers.get(res.id);
    this.busyOf.delete(res.id);
    this.handlers.delete(res.id);
    if (worker) this.idle.push(worker);
    handler?.(res);
  }
}
