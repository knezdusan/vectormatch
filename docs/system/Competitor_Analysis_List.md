# VectorMatch - Competitor Analysis List (The "Gold" 12)

**Document Purpose:** Context for multi-agent brainstorming session.
**Objective:** Reverse-engineer the data acquisition and ingestion strategies of successful competitors who do NOT rely heavily on standard ATS APIs, specifically to solve the "Serbia / Global Remote / Startup" pipeline drought.

---

## Category A: The Geo-Arbitrage Specialists
*Focus: How do they source Western/US startups specifically looking to hire in Eastern Europe (CEE/Serbia)?*

1. **JobRack.eu**
   - **Why they matter:** Explicitly connects Eastern European developers with Western startups. 
   - **Extraction Target:** How are they identifying and acquiring these specific Western companies? Is it purely outbound sales, or are they scraping specific tech-hub funding signals?
2. **NoFluffJobs.com**
   - **Why they matter:** Massive in CEE. They force strict taxonomy (mandatory salary ranges, specific tech stacks).
   - **Extraction Target:** How do they enforce this structured data without turning companies away? Can we scrape their highly-structured public listings to seed our own "known remote-friendly" company registry?
3. **JustJoin.it**
   - **Why they matter:** Similar to NoFluffJobs, deeply penetrated in the European market with map-based/geo-specific remote targeting.

## Category B: The Direct-to-Founder / Startup Hubs
*Focus: How do we extract data from walled gardens where founders post jobs directly, bypassing standard ATS systems entirely?*

4. **Wellfound (formerly AngelList)**
   - **Why they matter:** The holy grail of early-stage startups. They act as their own internal ATS.
   - **Extraction Target:** How do we programmatically shadow their directories without hitting their anti-scraping walls?
5. **YCombinator ("Work at a Startup")**
   - **Why they matter:** Deepest pool of highly funded, remote-friendly early-stage startups.
   - **Extraction Target:** Reverse-engineering their company directory and founder footprinting.
6. **Cord.com**
   - **Why they matter:** Bypasses job descriptions entirely; focuses on direct messaging with hiring managers. 
   - **Extraction Target:** Can VectorMatch identify and ingest "Hiring Managers" or "CTOs" directly instead of just parsing ATS job URLs?

## Category C: Premium Inbound / High-Curation Remote
*Focus: How do they build inbound pipelines and enrich company data to perfectly match remote culture?*

7. **RemoteOK.com**
   - **Why they matter:** Massive inbound loop. Companies pay $500+ just to bypass their ATS and post directly to this community.
   - **Extraction Target:** How to replicate this inbound "Claim your Company" or "Post a Job" flywheel for VectorMatch.
8. **WeWorkRemotely.com (WWR)**
   - **Why they matter:** The oldest and largest remote inbound board.
   - **Extraction Target:** Analyzing their RSS/Atom feed structures and inbound community loops.
9. **Himalayas.app**
   - **Why they matter:** Industry-best company footprinting. They map a company's tech stack, remote culture, and benefits perfectly.
   - **Extraction Target:** Reverse-engineer their company enrichment pipeline. Where are they getting this deep metadata?
10. **DynamiteJobs.com**
    - **Why they matter:** Heavy manual curation. They find hidden remote jobs and manually verify if they are *truly* global remote.
    - **Extraction Target:** Can we automate their manual "True Global Remote" verification process using our new LLM normalization pipeline?
11. **Remotive.com**
    - **Why they matter:** Highly curated, community-first remote listings.
12. **RemoteRocketship.com**
    - **Why they matter:** They scrape heavily but structure the data flawlessly for remote workers. 
    - **Extraction Target:** Analyze what non-ATS domains they are targeting for their crawler.