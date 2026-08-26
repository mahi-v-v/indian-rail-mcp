# Permission request — NTES data

The [NTES Terms and Conditions](https://enquiry.indianrail.gov.in/mntes/disclaimerDisplay.html) restrict
programmatic reproduction of railway data, and in the same breath say how to get it allowed:

> **COPYRIGHT POLICY:** Material featured on this Website may be reproduced free of charge after taking proper
> permission by sending a mail to us.

**Status: not yet sent.** Update this line when it goes out, and again when a reply arrives.

---

## Where to send it

**To:** `contactus@cris.org.in`

That is the general enquiry address published under **"Contact Us"** on the CRIS website
(<https://cris.org.in>), verified there rather than taken from a directory site. NTES is built and operated by
CRIS, so they are the "us" the terms refer to.

Full postal details from the same page, worth putting in the signature so the request looks like what it is:

> Centre for Railway Information Systems (Head Office)
> Chanakyapuri, New Delhi – 110021
> Phone: 011-24104525, 011-24106717

**If there is no reply after three or four weeks**, escalate through the RTI channel — a Right to Information
request is a statutory route CRIS must respond to, and asking "under what terms may railway enquiry data be
reused programmatically" is a fair RTI question. Current officers, from the CRIS site:

| Role | Officer | Email |
|---|---|---|
| Chief Public Information Officer | Mr. Rajiv Kad (Registrar) | `kad.rajiv@cris.org.in` |
| Appellate Authority | Shri Rajesh Abrol | `abrol.rajesh@cris.org.in` |
| Asst. Public Information Officer | Shri Virender Kumar Setia | `kumar.virender@cris.org.in` |

Note the NTES site's own "Complaints" link goes to RailMadad, which is a passenger grievance portal — the wrong
channel for this, so don't use it.

Send from an address you actually monitor, and **keep the reply**. It is the thing that separates this project
from every rail scraper that quietly got shut off.

---

## The email

Fill in the three angle-bracket placeholders and send as plain text.

---

**To:** contactus@cris.org.in
**Subject:** Request for permission to reuse NTES train enquiry data — open-source developer library

Dear Sir/Madam,

I am writing to request written permission to reuse publicly available train enquiry information from the
National Train Enquiry System (https://enquiry.indianrail.gov.in/mntes).

I have built a free, open-source software library that lets developers read train running information
programmatically. I am approaching you before promoting it, because the NTES Terms and Conditions state under
"Limited Permission to Copy" that reproduction of this kind requires prior written permission, and under
"Copyright Policy" that such permission may be granted free of charge on request.

What the library does:

1. **Information used** — train schedules, live running status, trains between two stations, and the live
   station board. All of it is information NTES already publishes openly on its website to any visitor. No
   internal, private or undocumented systems are accessed, and no login or credential is used.

2. **Volume** — requests are made only when a user asks a question, one at a time. Information that does not
   change during a day, such as timetables, is cached so that repeated questions do not create repeated load on
   your servers, and requests are rate-limited per user. There is no bulk downloading, no scheduled crawling,
   and no copy or mirror of your database is created or distributed.

3. **Attribution** — every result credits the National Train Enquiry System, Centre for Railway Information
   Systems, as the source, together with a link to your website. The accompanying documentation states clearly
   that the project is independent and not endorsed by or affiliated with Indian Railways, CRIS or IRCTC, and
   that the information is best-effort and should be verified with the railways.

4. **Personal data** — no passenger information is stored, logged or processed in bulk by the library.

I would be glad to work within any conditions you consider appropriate. In particular I am happy to limit the
rate of requests to a figure you specify, to send an identifying User-Agent header so that traffic from this
library is clearly attributable and can be contacted or blocked by you at any time, to display a specific
attribution or disclaimer wording, or to stop entirely on request.

Two further questions, if I may:

- **Is there an official API or data-sharing arrangement** that I should be using instead? If so I would much
  prefer that route, and would be grateful for a pointer to it.
- **Would separate permission be required for commercial use?** The library is free and open-source today. If it
  were later used within a commercial product, I would want to be properly licensed rather than assume, so I
  would appreciate knowing what that process involves.

I am happy to provide any further details you need, or to submit this request in another format if there is a
prescribed one.

Thank you for your time and for maintaining a service that is genuinely useful to the public.

Yours faithfully,

&lt;your full name&gt;
&lt;your email address and phone number&gt;
Project repository: &lt;your GitHub URL&gt;

---

## Notes on tone

This is deliberately written as a permission request from a member of the public to a government body, not as a
developer's API enquiry. Three things do the work:

- It shows you **read their terms** and are complying voluntarily, before being asked.
- It **pre-empts the objections** — load, mirroring, attribution, personal data — rather than waiting to be
  challenged on them.
- It **offers a kill switch**: an identifying User-Agent they can block. That converts you from an anonymous
  scraper into a known, accountable caller, which is the single most persuasive thing in the letter.

Do not soften the commercial-use question or leave it out. Asking now is cheap; being found to have quietly gone
commercial on a personal-use permission later is not.
