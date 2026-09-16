import { saveCrmConnection } from '@/lib/crm/connections'
import {
  exchangeHubSpotCode,
  getHubSpotAccountId,
  getHubSpotAuthorizeUrl,
  getHubSpotConfig,
} from '@/lib/crm/hubspot-oauth'
import {
  exchangePipedriveCode,
  getPipedriveAccountId,
  getPipedriveAuthorizeUrl,
  getPipedriveConfig,
} from '@/lib/crm/pipedrive-oauth'
import {
  createPkce,
  exchangeSalesforceCode,
  getSalesforceAuthorizeUrl,
  getSalesforceConfig,
  getSalesforceOrgId,
} from '@/lib/crm/salesforce-oauth'
import { saveGoogleOAuthTokens } from '@/lib/google-gmail-auth'
import { exchangeGmailCode, getGmailAuthorizeUrl, getGmailConnectConfig } from '@/lib/google/gmail-connect'
import type { AuthorizeUrlBuilder, ExchangeOutcome, PersistDeps } from '@/lib/connectors/native'
import type { NativeConnectorProvider } from '@/lib/connectors/native-shared'

/**
 * The four providers, for the native flow, on the same helpers the web
 * callbacks use: the same configuration (and so the same registered redirect
 * URI), the same authorize URL, the same token exchange, the same refusals —
 * a Salesforce token without its instance, a Pipedrive token without its API
 * domain, a Gmail grant without a refresh token — and the same save functions,
 * which encrypt CRM tokens exactly as a web connection does.
 */

export const nativeAuthorizeUrl: AuthorizeUrlBuilder = (provider, state, pkceChallenge) => {
  switch (provider) {
    case 'google-gmail': {
      const config = getGmailConnectConfig()
      return config ? getGmailAuthorizeUrl(config, state) : null
    }
    case 'hubspot': {
      const config = getHubSpotConfig()
      return config ? getHubSpotAuthorizeUrl(config, state) : null
    }
    case 'pipedrive': {
      const config = getPipedriveConfig()
      return config ? getPipedriveAuthorizeUrl(config, state) : null
    }
    case 'salesforce': {
      const config = getSalesforceConfig()
      return config && pkceChallenge ? getSalesforceAuthorizeUrl(config, state, pkceChallenge) : null
    }
  }
}

export function nativePkceFor(provider: NativeConnectorProvider) {
  return provider === 'salesforce' ? createPkce() : null
}

export async function exchangeNativeConnectorCode(
  provider: NativeConnectorProvider,
  code: string,
  verifier: string | null
): Promise<ExchangeOutcome> {
  switch (provider) {
    case 'hubspot': {
      const config = getHubSpotConfig()
      if (!config) return { ok: false, code: 'config_missing' }
      const tokens = await exchangeHubSpotCode(config, code)
      if (!tokens) return { ok: false, code: 'token_exchange_failed' }
      const remoteAccountId = await getHubSpotAccountId(config, tokens.accessToken)
      return {
        ok: true,
        result: {
          kind: 'crm',
          provider,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          remoteAccountId,
          apiBaseUrl: null,
        },
      }
    }
    case 'pipedrive': {
      const config = getPipedriveConfig()
      if (!config) return { ok: false, code: 'config_missing' }
      const tokens = await exchangePipedriveCode(config, code)
      if (!tokens) return { ok: false, code: 'token_exchange_failed' }
      if (!tokens.apiBaseUrl) return { ok: false, code: 'api_domain_missing' }
      const remoteAccountId = await getPipedriveAccountId(tokens.apiBaseUrl, tokens.accessToken)
      return {
        ok: true,
        result: {
          kind: 'crm',
          provider,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          remoteAccountId,
          apiBaseUrl: tokens.apiBaseUrl,
        },
      }
    }
    case 'salesforce': {
      if (!verifier) return { ok: false, code: 'pkce_verifier_missing' }
      const config = getSalesforceConfig()
      if (!config) return { ok: false, code: 'config_missing' }
      const tokens = await exchangeSalesforceCode(config, code, verifier)
      if (!tokens) return { ok: false, code: 'token_exchange_failed' }
      if (!tokens.instanceUrl) return { ok: false, code: 'instance_url_missing' }
      const remoteAccountId = await getSalesforceOrgId(tokens.instanceUrl, tokens.accessToken)
      return {
        ok: true,
        result: {
          kind: 'crm',
          provider,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: null,
          remoteAccountId,
          apiBaseUrl: tokens.instanceUrl,
        },
      }
    }
    case 'google-gmail': {
      const config = getGmailConnectConfig()
      if (!config) return { ok: false, code: 'config_missing' }
      let tokens
      try {
        tokens = await exchangeGmailCode(config, code)
      } catch {
        // Google's wording stays out of every log and response.
        return { ok: false, code: 'token_exchange_failed' }
      }
      if (!tokens.refreshToken) return { ok: false, code: 'no_refresh_token' }
      return {
        ok: true,
        result: {
          kind: 'gmail',
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresIn != null ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : null,
          email: tokens.email,
        },
      }
    }
  }
}

export const nativePersist: PersistDeps = {
  saveCrm: (args) => saveCrmConnection(args),
  saveGmail: (ownerId, tokens) => saveGoogleOAuthTokens(ownerId, tokens),
}
