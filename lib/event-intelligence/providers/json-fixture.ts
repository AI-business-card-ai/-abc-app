import {
  FIXTURE_EVENT,
  FIXTURE_EXHIBITORS,
} from '@/lib/event-intelligence/fixtures/abc-industrial-future-expo'
import type {
  EventDataProvider,
  ProviderEvent,
  ProviderEventRef,
  ProviderExhibitor,
} from '@/lib/event-intelligence/provider'

/**
 * The only provider that exists: a fixed, local, synthetic dataset.
 *
 * It fetches nothing. There is no network call, no credential, no dependency
 * and no external service behind this — which is the point. It exists so that
 * every other part of the feature can be built and tested end to end while the
 * questions that actually gate real data (which source, on what terms, at what
 * cost) stay open for the owner to answer.
 *
 * It is a real implementation of the interface rather than a stub: ingestion
 * treats it exactly as it will treat a directory API, so the code path being
 * exercised in tests is the code path that will run in production.
 */
export class JsonFixtureProvider implements EventDataProvider {
  readonly id: string
  readonly displayName = 'Synthetic demo dataset'
  readonly payloadVersion = 'v1'

  private readonly event: ProviderEvent
  private readonly exhibitors: ProviderExhibitor[]

  /**
   * Defaults to the checked-in fair. A dataset can be passed instead, which is
   * how the suite proves refresh behaviour: the same provider id returning
   * changed listings is exactly what a second fetch of a real directory is.
   */
  constructor(dataset?: { event: ProviderEvent; exhibitors: ProviderExhibitor[]; id?: string }) {
    this.event = dataset?.event ?? FIXTURE_EVENT
    this.exhibitors = dataset?.exhibitors ?? FIXTURE_EXHIBITORS
    this.id = dataset?.id ?? 'fixture:abc-industrial-future-expo'
  }

  /** What this dataset can be asked for, so a caller need not guess the ref. */
  availableEvents(): ProviderEventRef[] {
    return [{ providerEventId: this.event.providerRecordId }]
  }

  async fetchEvent(ref: ProviderEventRef): Promise<ProviderEvent | null> {
    return ref.providerEventId === this.event.providerRecordId ? this.event : null
  }

  async *fetchExhibitors(ref: ProviderEventRef): AsyncIterable<ProviderExhibitor> {
    if (ref.providerEventId !== this.event.providerRecordId) return
    for (const exhibitor of this.exhibitors) yield exhibitor
  }
}

/** The demo fair's key, so screens and tests do not each spell it out. */
export const DEMO_EVENT_REF: ProviderEventRef = {
  providerEventId: FIXTURE_EVENT.providerRecordId,
}
