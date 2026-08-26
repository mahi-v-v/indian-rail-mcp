# Permission request — NTES data

The [NTES Terms and Conditions](https://enquiry.indianrail.gov.in/mntes/disclaimerDisplay.html) restrict
programmatic reproduction of railway data, and in the same breath say how to get it allowed:

> **COPYRIGHT POLICY:** Material featured on this Website may be reproduced free of charge after taking proper
> permission by sending a mail to us.

**Status: requested, pending.** Update this line when a reply arrives.

## Before sending

No contact address is published on the NTES pages themselves, so confirm the current one rather than guessing:

- The **Complaints / Feedback** link in the NTES footer (`enquiry.indianrail.gov.in/mntes`)
- The CRIS website contact page — <https://cris.org.in>
- RailMadad, for a routing pointer — <https://railmadad.indianrailways.gov.in>

Address it to the NTES / CRIS webmaster. Send from an address you actually monitor, and keep the reply — it is
the thing that separates this project from every scraper that got shut off.

---

## Draft

**Subject:** Permission request — programmatic access to NTES train enquiry data (open-source developer library)

Dear CRIS / NTES team,

I am developing an open-source software library that lets developers query publicly available train
running-status, schedule and station-board information from the National Train Enquiry System.

Per the "Copyright Policy" and "Limited Permission to Copy" sections of the NTES Terms and Conditions, I am
writing to request written permission to reproduce this data.

Specifics:

- **Endpoints used:** train schedule, live running status, trains between stations, and the live station board,
  via the public `enquiry.indianrail.gov.in/mntes` web interface. No internal or undocumented systems.
- **Volume:** low, and on-demand only — a request is made when a user asks a question. Responses that do not
  change during a day (timetables, the trains between a station pair) are cached to reduce repeat load, and
  requests are rate-limited per client. There is no bulk crawling, no scheduled harvesting, and no mirroring of
  your database.
- **Attribution:** every response credits the National Train Enquiry System, Centre for Railway Information
  Systems, as the source, with a link to your site.
- **Personal data:** the library does not store, log or batch any passenger information.
- **Intent:** the library is open-source and freely available. I would also like to understand what permission
  would be required for commercial use, should the project later be used within a commercial product.

I would be glad to adjust request rates, add an identifying `User-Agent` so my traffic is attributable to me, or
meet any other conditions you require. If there is an official API or data-sharing programme I should be using
instead, I would much prefer that route and would be grateful for a pointer to it.

Thank you for your time.

Yours sincerely,
<your name>
<your contact address>
<repository URL>
