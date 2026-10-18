# Writing notes

Research and edits: October 17, 2026.

The README should answer what the app does, show a result, and explain how to run it. Details about ports, credentials, test modes, and state belong in the development guide. Interface text should name the action or result the user is looking at.

## Findings

Wikipedia's community guide describes recurring patterns such as inflated significance, formulaic contrasts, vague commentary, repetitive three-part phrases, and excessive bolding. It also cautions that these patterns do not establish who wrote a passage. We used it as an editing checklist. The project still discloses AI assistance. [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).

Vocabulary studies offer narrower evidence. Kobak and colleagues measured changes across biomedical abstracts. Juzek and Ward examined overrepresented words in scientific English. Geng and Trotta found that some conspicuous words declined after people called attention to them. These studies concern academic corpora, so applying their findings to software documentation requires judgment. Replacing a word list alone does little to explain a product. [Kobak et al.](https://arxiv.org/abs/2406.07016), [Juzek and Ward](https://aclanthology.org/2025.coling-main.426/), [Geng and Trotta](https://aclanthology.org/2025.findings-acl.657/).

The more useful test is whether readers can find and understand what they need. Nielsen Norman Group's web-writing study compared concise, scannable, objective text with promotional copy and found better usability in the revised versions. Its microcopy guidance puts clarity before brevity or personality. We kept technical details where they explain a decision, such as a missing `provenance_id`, and removed abstract claims about confidence. [Web-writing study](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/), [microcopy guidance](https://www.nngroup.com/articles/3-cs-microcopy/).

## Changes made

| Before                                                            | After                                                                       | Reason                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| “Prove a repair keeps the customer's promise.”                    | “Test incident repairs against customer requirements before applying them.” | Names the action and what is checked. |
| “Every candidate. Every requirement.”                             | “Compare repairs”                                                           | Describes the view.                   |
| “The context, intelligence, and execution behind each rehearsal.” | “Configure the investigator and inspect local services.”                    | Explains the settings page.           |
| “The response is healthy. The agreement is not satisfied.”        | “Alder's report is missing required provenance.”                            | Identifies the failed requirement.    |
| “The investigation starts with a rehearsal.”                      | “No investigation yet”                                                      | States the empty state directly.      |

The README now uses two screenshots with specific captions. The demo guide includes the comparison and approval views. The screenshots come from the running guided demo and retain its mode label. Setup details moved to [development](development.md); verification claims remain in the [test record](verification.md).

Lists, tables, technical terms, and punctuation remain where they help. Three rows are appropriate when the app offers three repairs. We did not add deliberate mistakes, invent a personal voice, or use detector scores as a quality measure.

## Documentation guidance consulted

NN/G's [generative-AI content policy](https://www.nngroup.com/contents/ai-content-policy/) also informed the review: check claims and citations after editing, and keep responsibility with the people publishing the work.

| Source                                                                                                                                                                                             | Application here                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Google: voice and tone](https://developers.google.com/style/tone)                                                                                                                                 | Remove buzzwords, filler openings, and repeated sentence patterns. Keep a direct, conversational tone.         |
| [Google: short sentences](https://developers.google.com/tech-writing/one/short-sentences)                                                                                                          | Give each sentence one main job; split setup instructions into steps.                                          |
| [Microsoft: style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice)                                                                                                | Put the useful information first and make the next action clear.                                               |
| [GOV.UK: content principles](https://www.gov.uk/government/publications/govuk-content-principles-conventions-and-research-background/govuk-content-principles-conventions-and-research-background) | Use specific statements, active verbs, and familiar words.                                                     |
| [GitHub: about README files](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)                                    | Keep the entry page about purpose and getting started. Use relative links for images and deeper documentation. |
