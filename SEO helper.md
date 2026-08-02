---
name: seo-content-optimizer
description: >
  Optimize blog posts and articles for SEO — keyword research, link insertion,
  heading structure, meta tags, and content enhancement — while preserving the
  author's original voice. Use this skill whenever the user asks to "optimize
  for SEO", "make this rank", "add keywords", "SEO this", "improve search
  ranking", "add links", "keyword optimize", "make this searchable", or pastes
  an article and asks to improve it for search. Also trigger when the user
  mentions "SEO" alongside any piece of written content, or asks to "add
  relevant links" or "do keyword research" for a draft. Do NOT use for
  technical SEO audits of websites (use searchfit-seo skills), site-wide SEO
  strategy, or content written from scratch (use content-research-writer or
  marketing:draft-content instead).
---

# SEO Content Optimizer

Takes a draft blog post or article and optimizes it for search — researching
real keywords, finding authoritative links from the web, improving heading
structure, and adding meta tags — all while keeping the author's voice intact.

## Why this matters

Most writers create great content but miss the SEO layer that makes it
discoverable. This skill bridges that gap: it doesn't rewrite the piece into
generic SEO-speak, it strategically enhances what's already there so search
engines understand and surface it.

---

## Workflow

### Step 1: Receive and analyze the draft

Read the full text. Identify:
- **Core topic** — what is this piece fundamentally about?
- **Target audience** — who would search for this?
- **Content type** — opinion piece, how-to, listicle, analysis, thought leadership?
- **Current structure** — does it have headings? How are they organized?
- **Existing keywords** — what terms already appear naturally?
- **Approximate word count** — this affects optimization depth

If the user hasn't specified a target keyword or topic, infer the primary one
from the content and confirm: "This reads like it's targeting [topic/keyword].
Should I optimize around that, or do you have a different focus?"

Also ask the user: "Do you want the output inline or as a file (.md)?"
If they've already specified, respect that. Default to inline for shorter
pieces (<1500 words) and offer a file for longer ones.

### Step 2: Keyword research

Use `web_search` to research real, current keywords. This is not optional —
every optimization must be grounded in actual search data.

Run 3-5 searches:
1. **Primary keyword search**: Search for the core topic to see what's ranking
   and what language top results use.
   Example: `best project management tools 2026`
2. **Related keywords / LSI**: Search for variations and related terms.
   Example: `project management software comparison`
3. **Question-based queries**: Search "how to [topic]" or "what is [topic]"
   to find question-format keywords people actually search.
   Example: `how to choose project management tool`
4. **Competitor content**: Search the exact topic to see what top-ranking
   articles cover that this draft might be missing.
5. **Long-tail variations**: Search for more specific versions of the keyword.
   Example: `project management tools for small teams remote`

From the search results, extract:
- **Primary keyword** (1) — the main term to optimize for
- **Secondary keywords** (3-5) — related terms to weave in naturally
- **Long-tail phrases** (2-3) — specific phrases for subsections
- **Questions people ask** (2-3) — for potential H2s or FAQ sections
- **Content gaps** — topics competitors cover that the draft doesn't mention

Present these findings to the user in a brief keyword summary before
proceeding with the optimization.

### Step 3: Find relevant links

Use `web_search` to find 5-10 high-quality, authoritative external links
that add value to the content. Search for:

1. **Data and statistics** that support claims in the article
2. **Authoritative sources** (studies, reports, official documentation)
3. **Complementary resources** the reader would find useful
4. **Recent/current references** that make the content feel up-to-date

**Link quality criteria:**
- Prefer .gov, .edu, established publications, and recognized industry sources
- Avoid competitor blogs unless they contain genuinely useful data
- Every link must add real value to the reader — no link stuffing
- Verify each link is from a reputable source (check the domain)
- Aim for links that are less than 12 months old when possible

**Link placement rules:**
- Insert links as natural anchor text within existing sentences
- Don't cluster links — spread them throughout the content
- Anchor text should describe what the reader will find, not "click here"
- Aim for 1 external link per 200-300 words (adjust based on content length)
- Don't link from headings

### Step 4: Optimize the content

Apply these optimizations while preserving the author's voice and style:

#### Title / H1
- Include the primary keyword, ideally near the beginning
- Keep under 60 characters for search display
- Make it compelling — it needs to earn the click
- If the original title is strong and on-brand, keep it and suggest an
  SEO-friendly alternative as an option, don't force a change

#### Meta description
- Write a meta description of 150-160 characters
- Include the primary keyword naturally
- Include a clear value proposition or hook
- Present this separately — it's not part of the article body

#### Heading structure (H2, H3)
- Ensure H2s cover the main subtopics and include secondary keywords where
  natural
- Add H2s for any content gaps identified in keyword research
- Use H3s to break up long sections
- Headings should read naturally — not as keyword dumps
- Preserve the author's heading style if they have one

#### Keyword integration
- Weave primary keyword into: the first 100 words, at least one H2, and
  the conclusion
- Distribute secondary keywords across the body — aim for natural density,
  not a target number
- Use variations and synonyms rather than repeating the exact same phrase
- If a keyword insertion feels forced, skip it — readability beats density

#### Content enhancements
- Add a strong opening paragraph that signals the topic to search engines
  (the first 100 words matter disproportionately)
- If the piece lacks a conclusion, add a brief one that reinforces the
  primary keyword
- Suggest adding an FAQ section if the keyword research surfaced common
  questions that aren't addressed in the body
- If the content is thin on a subtopic that competitors cover well, flag it
  and suggest 2-3 sentences to add (but don't pad — only add substance)

#### Readability for SEO
- Break up paragraphs longer than 4-5 sentences
- Ensure there's a heading every 200-300 words
- Use transition phrases between sections
- Bold key phrases sparingly (1-2 per section max) where it aids scanning

### Step 5: Deliver the output

Present the optimized content with clear annotations of what changed and why.

**Always include these elements:**

1. **SEO Summary Card** — at the top, before the optimized text:
   ```
   ## SEO Summary
   - **Primary keyword:** [keyword]
   - **Secondary keywords:** [list]
   - **Meta description:** [the meta description]
   - **Suggested URL slug:** [slug]
   - **External links added:** [count]
   - **Key changes:** [2-3 bullet summary of what was optimized]
   ```

2. **The optimized text** — with links embedded as markdown links.
   Mark new/changed sections with a brief inline comment like
   `<!-- SEO: added keyword variation -->` so the author can find and
   review changes easily. Keep these comments minimal — one per
   significant change, not on every sentence.

3. **Change log** — after the text, a brief list:
   - What was added (new sections, links, keywords)
   - What was restructured (heading changes, paragraph breaks)
   - What was left untouched and why
   - Any suggestions the author should consider but that weren't applied
     (e.g., "Your intro is strong — I kept it as-is but you could add
     [keyword] to the second sentence if you want")

**Output format:**
- If the user asked for a file: save as `.md` to `/mnt/user-data/outputs/`
  and present it. Include the SEO summary card at the top of the file
  as a markdown comment block.
- If the user asked for inline or didn't specify (and content is <1500 words):
  present directly in chat.

---

## Important principles

**Voice preservation is non-negotiable.** The author chose their words for a
reason. This skill adds SEO infrastructure around and within the existing
content — it doesn't flatten distinctive writing into generic web copy. If a
sentence is well-written but doesn't contain a keyword, leave it alone unless
there's a natural way to integrate one without changing the meaning or tone.

**Every link must earn its place.** A link that doesn't help the reader
understand something better or take a useful next step is SEO noise. Quality
over quantity, always.

**Keywords are tools, not goals.** The goal is helping the right readers find
this content. Keywords are the mechanism, not the point. If the content already
ranks for a term naturally, don't over-optimize it.

**Be transparent about tradeoffs.** If a change improves SEO but weakens the
writing, say so and let the author decide. Present it as an option, not a
mandate.

---

## Edge cases

- **Very short content (<500 words):** Focus on title, meta description, one
  or two keyword insertions, and 2-3 strong links. Don't try to turn a short
  piece into a long one.
- **Opinion/editorial pieces:** Go lighter on keyword optimization. The
  author's voice IS the value. Focus on heading structure, meta description,
  and links.
- **Technical content:** Keywords may be jargon-heavy and that's fine. Don't
  simplify technical terms for SEO — the audience searching for them uses
  those exact terms.
- **Content in Hebrew:** Apply the same principles but be aware that Hebrew
  keyword research may yield fewer results. Use both Hebrew and English
  search queries where the audience might search in either language.
- **Content already well-optimized:** If the draft is already strong on SEO,
  say so. Don't add changes for the sake of showing work. Focus on link
  additions and any gaps.
