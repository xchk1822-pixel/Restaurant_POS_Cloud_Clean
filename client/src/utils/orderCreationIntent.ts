export type OrderCreationIntent = {
  id: string;
  startedAt: number;
  orderNumber?: string;
};

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const createIntentId = () => {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `order-${Date.now()}-${randomPart}`;
};

export class OrderCreationCoordinator {
  private intent: OrderCreationIntent | null = null;
  private orderNumberPromise: Promise<string> | null = null;

  constructor(
    private readonly storageKey: string,
    private readonly storage: IntentStorage,
    private readonly idFactory: () => string = createIntentId
  ) {
    this.intent = this.load();
  }

  private load(): OrderCreationIntent | null {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.id) return null;
      return {
        id: String(parsed.id),
        startedAt: Number(parsed.startedAt) || Date.now(),
        orderNumber: parsed.orderNumber ? String(parsed.orderNumber) : undefined,
      };
    } catch {
      return null;
    }
  }

  private persist() {
    try {
      if (!this.intent) {
        this.storage.removeItem(this.storageKey);
        return;
      }
      this.storage.setItem(this.storageKey, JSON.stringify(this.intent));
    } catch {
      // The in-memory intent still keeps retries idempotent when browser storage is unavailable.
    }
  }

  beginNew(): OrderCreationIntent {
    this.intent = { id: this.idFactory(), startedAt: Date.now() };
    this.orderNumberPromise = null;
    this.persist();
    return this.intent;
  }

  bindExisting(id: string, orderNumber?: string): OrderCreationIntent {
    this.intent = {
      id,
      startedAt: this.intent?.id === id ? this.intent.startedAt : Date.now(),
      orderNumber: orderNumber || (this.intent?.id === id ? this.intent.orderNumber : undefined),
    };
    this.orderNumberPromise = null;
    this.persist();
    return this.intent;
  }

  claim(existingOrderId?: string | null, existingOrderNumber?: string): OrderCreationIntent {
    if (existingOrderId) return this.bindExisting(existingOrderId, existingOrderNumber);
    return this.intent || this.beginNew();
  }

  async getOrCreateOrderNumber(factory: () => Promise<string>): Promise<string> {
    const intent = this.intent || this.beginNew();
    if (intent.orderNumber) return intent.orderNumber;
    if (this.orderNumberPromise) return this.orderNumberPromise;

    this.orderNumberPromise = factory()
      .then(orderNumber => {
        if (this.intent?.id === intent.id) {
          this.intent = { ...intent, orderNumber };
          this.persist();
        }
        return orderNumber;
      })
      .finally(() => {
        this.orderNumberPromise = null;
      });

    return this.orderNumberPromise;
  }

  clear(expectedId?: string) {
    if (expectedId && this.intent?.id !== expectedId) return;
    this.intent = null;
    this.orderNumberPromise = null;
    this.persist();
  }

  current(): OrderCreationIntent | null {
    return this.intent;
  }
}

export const createBrowserOrderCreationCoordinator = (storageKey: string) => (
  new OrderCreationCoordinator(storageKey, window.sessionStorage)
);
