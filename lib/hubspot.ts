export async function createHubSpotContact(
  contact: {
    name: string
    email?: string
    phone?: string
    company?: string
    position?: string
  },
  apiKey: string
): Promise<boolean> {
  try {
    const [firstname, ...rest] = (contact.name || '').split(' ')
    const lastname = rest.join(' ') || ''

    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        properties: {
          firstname: firstname || '',
          lastname: lastname || '',
          email: contact.email || '',
          phone: contact.phone || '',
          company: contact.company || '',
          jobtitle: contact.position || '',
        },
      }),
    })

    if (res.status === 409) {
      // Kontakt již existuje — není chyba
      console.log('HubSpot: contact already exists')
      return true
    }

    if (!res.ok) {
      const err = await res.text()
      console.error('HubSpot sync failed:', err)
      return false
    }

    console.log('HubSpot: contact created successfully')
    return true
  } catch (e) {
    console.error('HubSpot sync error:', e)
    return false
  }
}
