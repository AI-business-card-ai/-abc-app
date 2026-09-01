/**
 * The five things Settings is made of, named once.
 *
 * Settings used to be a single 460-line screen that mixed four unrelated
 * concerns — your plan, the tone AI writes in, your identity, and signing out —
 * under one heading, with a Save button that only applied to some of them. The
 * screen was not wrong so much as unaddressable: there was no URL for "billing",
 * so nothing could link to it and nothing could be found twice.
 *
 * Each entry below is a place, not a section of a page. The hub renders this
 * list, so a category cannot exist in the navigation without a route behind it,
 * and a route cannot quietly appear without a name and a description.
 *
 * Deliberately data-only: no React, no icons, no server imports. The hub maps
 * `id` to an icon; tests read this file without rendering anything.
 */

export type SettingsSectionId =
  | 'profile'
  | 'card'
  | 'follow-up'
  | 'integrations'
  | 'billing'

export type SettingsSection = {
  id: SettingsSectionId
  /** What the category is called, everywhere it is called anything. */
  title: string
  /** One line, in the user's terms, about what lives there. */
  description: string
  href: string
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'profile',
    title: 'Profile & Account',
    description: 'Your identity and account',
    href: '/settings/profile',
  },
  {
    id: 'card',
    title: 'My Card Settings',
    description: 'Edit what people see when you share your card',
    href: '/settings/card',
  },
  {
    id: 'follow-up',
    title: 'Smart Follow-up',
    description: 'Teach ABC how you want to communicate',
    href: '/settings/follow-up',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Connect your CRM and services',
    href: '/settings/integrations',
  },
  {
    id: 'billing',
    title: 'Plan & Billing',
    description: 'Your plan, usage and billing',
    href: '/settings/billing',
  },
] as const

/** Where the hub lives, for the back links on every subsection. */
export const SETTINGS_HUB_PATH = '/settings'

/**
 * The card editor's address.
 *
 * There is one card editor. It answered to /profile/card first and now answers
 * to /settings/card, and this constant is what everything else links to so the
 * two never become two editors.
 */
export const CARD_EDITOR_PATH = '/settings/card'
