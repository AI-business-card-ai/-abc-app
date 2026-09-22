/**
 * What a web page says, read deterministically.
 *
 * No model and no dependency: a small tokenizer that walks the markup once and
 * keeps the parts that state facts — the title, the meta description, the
 * headings, list items and paragraphs, the links, and any schema.org
 * Organization a site publishes about itself. Scripts, styles, forms and
 * embedded media are dropped. Text inside navigation, headers and footers is
 * kept apart: it is useful for finding pages and useless as evidence, because
 * a menu saying "Medical" is not the company saying it serves medicine.
 *
 * Everything is bounded — per element, per page — so a hostile or enormous
 * page costs the same as an ordinary one.
 */

export type PageLink = { href: string; text: string; inNav: boolean }

export type PageBlock = { text: string; inNav: boolean }

export type PageHeading = { level: 1 | 2 | 3; text: string; inNav: boolean }

export type OrganizationData = {
  name: string | null
  url: string | null
  description: string | null
  country: string | null
}

export type PageContent = {
  title: string | null
  metaDescription: string | null
  siteName: string | null
  lang: string | null
  canonical: string | null
  /** `<meta name="robots">` nofollow: the page asks not to be used for discovery. */
  nofollow: boolean
  headings: PageHeading[]
  items: PageBlock[]
  paragraphs: PageBlock[]
  links: PageLink[]
  organization: OrganizationData | null
}

export const EXTRACT_LIMITS = {
  elementChars: 400,
  headings: 120,
  items: 400,
  paragraphs: 200,
  links: 400,
} as const

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â', oacute: 'ó', uacute: 'ú',
  iacute: 'í', ccedil: 'ç', ntilde: 'ñ', aring: 'å', oslash: 'ø', aelig: 'æ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', euro: '€', times: '×',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ''
      try {
        return String.fromCodePoint(code)
      } catch {
        return ''
      }
    }
    return NAMED[name] ?? NAMED[name.toLowerCase()] ?? whole
  })
}

const clean = (text: string) => decodeEntities(text).replace(/\s+/g, ' ').trim().slice(0, EXTRACT_LIMITS.elementChars)

function attr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  if (!match) return null
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim()
}

const DROP = /<(script|style|noscript|svg|template|iframe|object|canvas|form|select|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track'])
const NAV = new Set(['nav', 'header', 'footer', 'aside'])
const BLOCK_CAPTURE = new Set(['title', 'h1', 'h2', 'h3', 'li', 'p', 'dt', 'dd', 'td', 'th'])

function organizationFrom(json: unknown): OrganizationData | null {
  const queue: unknown[] = [json]
  while (queue.length > 0) {
    const node = queue.shift()
    if (Array.isArray(node)) {
      queue.push(...node)
      continue
    }
    if (!node || typeof node !== 'object') continue
    const record = node as Record<string, unknown>
    if (Array.isArray(record['@graph'])) queue.push(...(record['@graph'] as unknown[]))
    const type = record['@type']
    const types = (Array.isArray(type) ? type : [type]).filter((t): t is string => typeof t === 'string')
    if (types.some((t) => /^(Organization|Corporation|LocalBusiness|Manufacturer|MedicalOrganization)$/i.test(t))) {
      const text = (value: unknown) => (typeof value === 'string' && value.trim() ? clean(value) : null)
      const address = record.address as Record<string, unknown> | undefined
      const countryValue = address?.addressCountry
      const country =
        typeof countryValue === 'string'
          ? text(countryValue)
          : countryValue && typeof countryValue === 'object'
            ? text((countryValue as Record<string, unknown>).name)
            : null
      return { name: text(record.name), url: text(record.url), description: text(record.description), country }
    }
  }
  return null
}

export function extractPage(html: string, baseUrl: string): PageContent {
  const page: PageContent = {
    title: null,
    metaDescription: null,
    siteName: null,
    lang: null,
    canonical: null,
    nofollow: false,
    headings: [],
    items: [],
    paragraphs: [],
    links: [],
    organization: null,
  }

  const source = html.slice(0, 2_000_000).replace(/<!--[\s\S]*?-->/g, '')

  // Structured data first, before scripts are dropped.
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/application\/ld\+json/i.test(match[1])) continue
    try {
      const organization = organizationFrom(JSON.parse(match[2]))
      if (organization) {
        page.organization = organization
        break
      }
    } catch {
      // Malformed structured data is ignored, not guessed at.
    }
  }

  const htmlTag = source.match(/<html\b([^>]*)>/i)
  if (htmlTag) page.lang = attr(htmlTag[1], 'lang')

  for (const match of source.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = match[1]
    const name = (attr(attrs, 'name') ?? attr(attrs, 'property') ?? '').toLowerCase()
    const content = attr(attrs, 'content')
    if (!content) continue
    if (name === 'description' && !page.metaDescription) page.metaDescription = clean(content)
    else if (name === 'og:description' && !page.metaDescription) page.metaDescription = clean(content)
    else if (name === 'og:site_name') page.siteName = clean(content)
    else if (name === 'robots' && /nofollow|none/i.test(content)) page.nofollow = true
  }
  for (const match of source.matchAll(/<link\b([^>]*)>/gi)) {
    if ((attr(match[1], 'rel') ?? '').toLowerCase() !== 'canonical') continue
    const href = attr(match[1], 'href')
    if (href) {
      try {
        page.canonical = new URL(href, baseUrl).toString()
      } catch {
        // ignored
      }
    }
  }

  const body = source.replace(DROP, ' ')

  type Capture = { tag: string; text: string; inNav: boolean; href?: string | null; nestedList?: boolean }
  const blocks: Capture[] = []
  const anchors: Capture[] = []
  let navDepth = 0
  const open: string[] = []

  const append = (text: string) => {
    if (!text) return
    const block = blocks[blocks.length - 1]
    if (block) block.text += text
    const anchor = anchors[anchors.length - 1]
    if (anchor) anchor.text += text
  }

  const close = (capture: Capture) => {
    const text = clean(capture.text)
    if (!text) return
    const inNav = capture.inNav
    switch (capture.tag) {
      case 'title':
        if (!page.title) page.title = text
        break
      case 'h1':
      case 'h2':
      case 'h3':
        if (page.headings.length < EXTRACT_LIMITS.headings) {
          page.headings.push({ level: Number(capture.tag[1]) as 1 | 2 | 3, text, inNav })
        }
        break
      case 'li':
      case 'dt':
      case 'dd':
      case 'td':
      case 'th':
        if (page.items.length < EXTRACT_LIMITS.items) page.items.push({ text, inNav })
        break
      case 'p':
        if (page.paragraphs.length < EXTRACT_LIMITS.paragraphs) page.paragraphs.push({ text, inNav })
        break
      case 'a':
        if (capture.href && page.links.length < EXTRACT_LIMITS.links) {
          try {
            page.links.push({ href: new URL(capture.href, baseUrl).toString(), text, inNav })
          } catch {
            // ignored
          }
        }
        break
    }
  }

  const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let last = 0
  for (const match of body.matchAll(TAG)) {
    append(body.slice(last, match.index))
    last = (match.index ?? 0) + match[0].length

    const tag = match[1].toLowerCase()
    const closing = match[0][1] === '/'
    const selfClosing = /\/\s*>$/.test(match[0])

    if (VOID.has(tag)) {
      if (tag === 'br') append(' ')
      continue
    }

    if (!closing) {
      if (NAV.has(tag)) navDepth++
      if (!selfClosing) open.push(tag)
      if (BLOCK_CAPTURE.has(tag)) {
        // A new block ends an unclosed paragraph or list item of the same kind —
        // unless it is a list item inside a nested list, which is a child, not a sibling.
        if (tag === 'p' || tag === 'li') {
          const top = blocks[blocks.length - 1]
          if (top && top.tag === tag && !top.nestedList) close(blocks.pop() as Capture)
        }
        blocks.push({ tag, text: '', inNav: navDepth > 0 })
      } else if (tag === 'a') {
        anchors.push({ tag, text: '', inNav: navDepth > 0, href: attr(match[2], 'href') })
      } else {
        if (tag === 'ul' || tag === 'ol') {
          const top = blocks[blocks.length - 1]
          if (top && top.tag === 'li') top.nestedList = true
        }
        append(' ')
      }
      continue
    }

    // Closing tag.
    if (NAV.has(tag)) navDepth = Math.max(0, navDepth - 1)
    const at = open.lastIndexOf(tag)
    if (at >= 0) open.length = at
    if (BLOCK_CAPTURE.has(tag)) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].tag !== tag) continue
        const [capture] = blocks.splice(i, 1)
        close(capture)
        break
      }
      append(' ')
    } else if (tag === 'a') {
      const capture = anchors.pop()
      if (capture) close(capture)
    } else {
      append(' ')
    }
  }
  append(body.slice(last))
  while (blocks.length > 0) close(blocks.pop() as Capture)
  while (anchors.length > 0) close(anchors.pop() as Capture)

  return page
}
