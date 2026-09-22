import { fixtureTransport, html, text, type FixtureRoute } from './transport'

/**
 * Company websites that exist only in the test — FIXTURE.
 *
 * `nordfeld-precision.invalid` is the owner's own (invented) company: a
 * precision aluminium machining shop for medical equipment, written to carry
 * every kind of thing the Product Brain reads — structured data, a meta
 * description, product headings, a certification in running text, a region —
 * and every kind of thing it must ignore: menus, a contact page, an imprint,
 * a login, a cart, a PDF, an off-site link, tracking parameters, a duplicate
 * page, and a managing director's email and phone number.
 *
 * `big-catalog.invalid` exists to be too big: forty product pages and a deep
 * chain, for the page, depth and time limits.
 */

export const OWNER_SITE = 'https://nordfeld-precision.invalid'

const nav = `
  <nav>
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/products">Products</a></li>
      <li><a href="/products/">Products again</a></li>
      <li><a href="/products?utm_source=nav">Products tracked</a></li>
      <li><a href="/industries/medical">Medical</a></li>
      <li><a href="/industries/automotive">Automotive</a></li>
      <li><a href="/capabilities">Capabilities</a></li>
      <li><a href="/about-us">About us</a></li>
      <li><a href="/contact">Contact</a></li>
      <li><a href="/impressum">Impressum</a></li>
      <li><a href="/datenschutz">Datenschutz</a></li>
      <li><a href="/login">Login</a></li>
      <li><a href="/cart">Cart</a></li>
      <li><a href="/news">News</a></li>
      <li><a href="/careers">Careers</a></li>
      <li><a href="/downloads/brochure.pdf">Brochure</a></li>
      <li><a href="https://www.linkedin.example/company/nordfeld">LinkedIn</a></li>
      <li><a href="https://shop.nordfeld-precision.invalid/products">Shop</a></li>
      <li><a href="/products/catalogue?page=2">Catalogue page 2</a></li>
    </ul>
  </nav>`

const footer = `<footer><p>© Nordfeld Precision GmbH · Medical · Aerospace · Automotive · Energy</p></footer>`

const page = (title: string, body: string, head = '') => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${head}
  <style>body { font-family: sans-serif }</style>
  <script>window.tracking = "ISO 99999 should never be read";</script>
</head>
<body>
  <header>${nav}</header>
  <main>${body}</main>
  ${footer}
</body>
</html>`

export function ownerSiteRoutes(overrides: Record<string, FixtureRoute> = {}) {
  const routes: Record<string, FixtureRoute> = {
    [`${OWNER_SITE}/robots.txt`]: text('User-agent: *\nDisallow: /internal/\nCrawl-delay: 1\n'),
    [`${OWNER_SITE}/`]: html(
      page(
        'Nordfeld Precision — Precision aluminium components',
        `<h1>Precision aluminium components</h1>
         <p>Nordfeld Precision is a family-owned manufacturer in Baden-W&uuml;rttemberg.</p>
         <p>We manufacture precision aluminium components for medical equipment manufacturers and supply customers across Europe.</p>
         <a href="/internal/dashboard">Internal</a>`,
        `<meta name="description" content="Nordfeld Precision manufactures precision aluminium components for medical equipment manufacturers across Europe.">
         <meta property="og:site_name" content="Nordfeld Precision">
         <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Nordfeld Precision GmbH","url":"https://nordfeld-precision.invalid","address":{"@type":"PostalAddress","addressCountry":"DE"}}</script>`
      )
    ),
    [`${OWNER_SITE}/products`]: html(
      page(
        'Products — Nordfeld Precision',
        `<h1>Our products</h1>
         <h2>Aluminium housings for medical imaging</h2>
         <p>Housings and frames for CT and MRI systems, machined from solid aluminium.</p>
         <h2>CNC-machined enclosures</h2>
         <ul><li>Heat sinks</li><li>Sensor brackets</li><li>Read more</li></ul>
         <a href="/products/aluminium-housings">Aluminium housings</a>`
      )
    ),
    [`${OWNER_SITE}/products/aluminium-housings`]: html(
      page(
        'Aluminium housings — Nordfeld Precision',
        `<h1>Aluminium housings</h1><h2>Anodised housings for diagnostic devices</h2><p>Anodising in-house.</p>`
      )
    ),
    [`${OWNER_SITE}/industries/medical`]: html(
      page(
        'Medical — Nordfeld Precision',
        `<h1>Medical technology</h1>
         <p>We supply OEMs in medical technology and laboratory automation. Our customers in Germany, Austria and Switzerland rely on our cleanroom assembly.</p>`
      )
    ),
    [`${OWNER_SITE}/industries/automotive`]: html(
      page('Automotive — Nordfeld Precision', `<h1>Automotive</h1><p>Selected automotive prototypes.</p>`)
    ),
    [`${OWNER_SITE}/capabilities`]: html(
      page(
        'Capabilities — Nordfeld Precision',
        `<h1>Capabilities</h1>
         <p>5-axis CNC machining, anodising and cleanroom assembly under ISO 13485:2016.</p>
         <ul><li>CNC machining</li><li>Anodising</li><li>Stainless steel on request</li></ul>`
      )
    ),
    [`${OWNER_SITE}/about-us`]: html(
      page(
        'About us — Nordfeld Precision',
        `<h1>About us</h1>
         <p>Founded in 1994. Certified to ISO 9001 and ISO 13485. Contact our managing director Dr. Hans Weber at hans.weber@nordfeld-precision.invalid or +49 211 555 0100.</p>`
      )
    ),
    // These exist, so that fetching them would succeed — which is the point: none may be fetched.
    [`${OWNER_SITE}/contact`]: html(page('Contact', `<p>Hans Weber, hans.weber@nordfeld-precision.invalid</p>`)),
    [`${OWNER_SITE}/impressum`]: html(page('Impressum', `<p>Geschäftsführer: Dr. Hans Weber</p>`)),
    [`${OWNER_SITE}/internal/dashboard`]: html(page('Internal', `<p>secret</p>`)),
    ...overrides,
  }
  return fixtureTransport(routes)
}

export const BIG_SITE = 'https://big-catalog.invalid'

export function bigSiteRoutes() {
  const productLinks = Array.from({ length: 40 }, (_, i) => `<li><a href="/products/p${i + 1}">Product line ${i + 1}</a></li>`).join('')
  const routes: Record<string, FixtureRoute> = {
    [`${BIG_SITE}/robots.txt`]: { status: 404, headers: { 'content-type': 'text/plain' }, body: '' },
    [`${BIG_SITE}/`]: html(`<html><body><h1>Big catalogue</h1><ul>${productLinks}</ul><a href="/solutions/a">Solutions A</a></body></html>`),
    [`${BIG_SITE}/solutions/a`]: html(`<html><body><h1>A</h1><h2>Solution alpha</h2><a href="/solutions/a/b">Solutions B</a></body></html>`),
    [`${BIG_SITE}/solutions/a/b`]: html(`<html><body><h1>B</h1><h2>Solution beta</h2><a href="/solutions/a/b/c">Solutions C</a></body></html>`),
    [`${BIG_SITE}/solutions/a/b/c`]: html(`<html><body><h1>C</h1><h2>Solution gamma</h2></body></html>`),
  }
  for (let i = 1; i <= 40; i++) {
    routes[`${BIG_SITE}/products/p${i}`] = html(`<html><body><h1>Product line ${i}</h1><h2>Widget series ${i}</h2></body></html>`)
  }
  return fixtureTransport(routes)
}
