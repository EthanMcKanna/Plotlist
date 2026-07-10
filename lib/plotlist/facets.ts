// Curated facet taxonomy for recommendations v2.
//
// Each facet is embedded once (gemini-embedding-2, RETRIEVAL_QUERY side) and
// every embedded show is scored against all of them; the top matches are
// stored in show_facets. Facets power category browsing ("Cozy Crime"),
// personalized rails ("Because you're into Nordic Noir"), and profile taste
// summaries. Editing a description changes what the facet retrieves — re-run
// the facet seeding step of scripts/embed-catalog.mjs after any change.
//
// Deliberately excluded: era ("90s shows") and pure metadata cuts (network,
// decade, rating) — those are exact SQL filters on the shows table, not
// semantic neighborhoods, and would waste facet slots on noise.

export type FacetGroupKey =
  | "mood"
  | "drama"
  | "scifi_fantasy"
  | "comedy"
  | "animation"
  | "unscripted"
  | "format"
  | "origin";

export type FacetDef = {
  key: string;
  group: FacetGroupKey;
  title: string;
  description: string;
};

export const FACET_GROUPS: Record<FacetGroupKey, { title: string }> = {
  mood: { title: "Moods & vibes" },
  drama: { title: "Drama & thrillers" },
  scifi_fantasy: { title: "Sci-fi, fantasy & horror" },
  comedy: { title: "Comedy" },
  animation: { title: "Animation & anime" },
  unscripted: { title: "Reality & documentary" },
  format: { title: "Formats" },
  origin: { title: "World TV" },
};

// How many facets a show keeps and the floor a calibrated score must clear.
// Scores stored in show_facets are z-score-calibrated cosines mapped through
// a logistic squash, so 0.5 ≈ "typical member of this facet". Tuned against
// the wave-1 backfill distribution (see scripts/embed-catalog.mjs --calibrate).
export const FACETS_PER_SHOW_MAX = 8;
export const FACET_MIN_SCORE = 0.5;

const d = (key: string, group: FacetGroupKey, title: string, description: string): FacetDef => ({
  key,
  group,
  title,
  description,
});

export const FACET_DEFS: FacetDef[] = [
  // ── Moods & vibes ────────────────────────────────────────────────────────
  d("cozy-comfort", "mood", "Cozy Comfort", "Gentle, comforting television with warm characters, low stakes, and a soothing pace — the TV equivalent of a warm blanket and a cup of tea."),
  d("feel-good", "mood", "Feel-Good", "Uplifting, optimistic shows about kindness, friendship, and people improving each other's lives; leaves the viewer happier than it found them."),
  d("dark-gritty", "mood", "Dark & Gritty", "Bleak, morally murky television with violence, corruption, and flawed people in unforgiving worlds; unflinching realism over comfort."),
  d("mind-bending", "mood", "Mind-Bending", "Puzzle-box narratives with unreliable reality, nonlinear timelines, twists, and big philosophical questions that reward close attention and theories."),
  d("edge-of-seat", "mood", "Edge of Your Seat", "Relentless, high-tension thrillers driven by ticking clocks, cliffhangers, and constant danger; impossible to watch just one episode."),
  d("heartwarming", "mood", "Heartwarming", "Emotionally warm stories about family bonds, found family, and small human kindnesses that make viewers tear up in a good way."),
  d("tearjerker", "mood", "Tearjerker", "Emotionally devastating drama about grief, loss, illness, and love; built to make the audience cry."),
  d("laugh-out-loud", "mood", "Laugh-Out-Loud", "Relentlessly funny comedy with jokes-per-minute density, absurd situations, and comic performances that produce actual out-loud laughter."),
  d("campy-fun", "mood", "Campy Fun", "Gloriously over-the-top television that embraces melodrama, kitsch, and self-aware absurdity; so-bad-it's-good energy done on purpose."),
  d("slow-burn", "mood", "Slow Burn", "Deliberately paced, contemplative storytelling that builds atmosphere and character over plot; patient viewing that pays off in the long run."),
  d("soapy-addictive", "mood", "Soapy & Addictive", "Deliciously dramatic serialized shows full of secrets, betrayals, love triangles, and scandal; guilty-pleasure appointment viewing."),
  d("wholesome-family", "mood", "Wholesome Family Night", "Clean, all-ages entertainment parents and kids can watch together without anyone getting bored or embarrassed."),
  d("disturbing", "mood", "Disturbing & Unsettling", "Deeply unsettling television that lingers — psychological dread, body horror, depravity, and imagery that gets under the skin."),
  d("romantic", "mood", "Swoon-Worthy Romance", "Love stories with longing, chemistry, grand gestures, and will-they-won't-they tension at the center of the show."),
  d("atmospheric-moody", "mood", "Atmospheric & Moody", "Visually striking shows dripping with atmosphere — fog, neon, silence, and dread — where mood and place matter as much as plot."),
  d("quirky-offbeat", "mood", "Quirky & Offbeat", "Idiosyncratic shows with a singular oddball voice, eccentric characters, and a tone that fits no standard genre box."),
  d("epic-sweeping", "mood", "Epic & Sweeping", "Grand-scale sagas with huge casts, sprawling worlds, wars, dynasties, and stakes that span generations or kingdoms."),
  d("intimate-character", "mood", "Intimate Character Study", "Small-scale, deeply human portraits of complicated people, where the drama lives in conversations, silences, and interior lives."),
  d("satirical", "mood", "Sharp Satire", "Biting satire that skewers politics, media, wealth, or institutions with wit, irony, and uncomfortable truths."),
  d("absurdist", "mood", "Absurdist & Surreal", "Reality-warping surreal comedy and drama with dream logic, non sequiturs, and experimental storytelling."),
  d("nostalgic", "mood", "Nostalgic Throwback", "Shows steeped in affectionate nostalgia for a past era — its music, fashion, and growing-up rituals — or beloved classics that define one."),
  d("macabre", "mood", "Delightfully Macabre", "Darkly whimsical shows that find humor and beauty in death, monsters, and the gothic; spooky but charming rather than terrifying."),

  // ── Drama & thrillers ────────────────────────────────────────────────────
  d("prestige-antihero", "drama", "Prestige Antihero", "Acclaimed character-driven dramas built around a magnetic, morally compromised protagonist whose choices spiral into tragedy."),
  d("crime-procedural", "drama", "Crime Procedural", "Case-of-the-week police and investigator shows where a team solves a new crime each episode with forensic detail and reliable rhythms."),
  d("detective-mystery", "drama", "Detective Mystery", "Brilliant, often eccentric detectives untangling layered murder mysteries; clues, red herrings, and satisfying reveals."),
  d("cozy-crime", "drama", "Cozy Crime", "Gentle murder mysteries in charming villages and small towns, solved by amateur sleuths; comforting puzzles rather than gruesome darkness."),
  d("true-crime-drama", "drama", "True Crime Dramatization", "Scripted dramatizations of real crimes, trials, scandals, and criminals, often based on journalism or court records."),
  d("legal", "drama", "Legal Drama", "Courtroom battles, law firms, verdicts, and moral gray zones of the justice system; objections, closing arguments, and office politics."),
  d("medical", "drama", "Medical Drama", "Hospitals, surgeons, and emergency rooms — life-and-death cases interwoven with the personal lives of doctors and nurses."),
  d("political-thriller", "drama", "Political Thriller", "Power struggles in governments and campaigns: conspiracies, leaks, betrayals, and the machinery of political ambition."),
  d("spy-espionage", "drama", "Spy & Espionage", "Intelligence agencies, undercover operatives, tradecraft, double agents, and Cold War or modern geopolitical intrigue."),
  d("psychological-thriller", "drama", "Psychological Thriller", "Cat-and-mouse games, manipulation, obsession, and unreliable minds; tension that comes from psychology rather than action."),
  d("serial-killer", "drama", "Serial Killer Hunt", "Profilers and detectives hunting serial murderers; forensic psychology, disturbing crime scenes, and the abyss staring back."),
  d("mob-crime", "drama", "Mob & Organized Crime", "Crime families, cartels, and syndicates — loyalty, violence, and the business of the underworld from the criminals' side."),
  d("heist-con", "drama", "Heists & Cons", "Charismatic crews pulling elaborate heists, cons, and scams; clever plans, double-crosses, and capers."),
  d("prison", "drama", "Prison Drama", "Life inside prisons — survival, hierarchies, guards and inmates, and what incarceration does to people."),
  d("family-saga", "drama", "Family Saga", "Multi-generational family dramas about inheritance, loyalty, resentment, and secrets around the dinner table or the boardroom."),
  d("teen-drama", "drama", "Teen Drama", "High school and college life with heightened emotional stakes: identity, first love, cliques, parties, and secrets."),
  d("coming-of-age", "drama", "Coming of Age", "Tender, honest stories about growing up — adolescence, self-discovery, first heartbreak, and figuring out who you are."),
  d("period-costume", "drama", "Period & Costume Drama", "Sumptuous historical settings, manners, and romance — corsets, estates, and society constraints from centuries past."),
  d("historical-epic", "drama", "Historical Epic", "Large-scale drama built on real history — kings, wars, empires, explorers, and pivotal moments recreated in detail."),
  d("war", "drama", "War Drama", "Soldiers and civilians in wartime — combat, brotherhood, moral cost, and survival on and off the battlefield."),
  d("western", "drama", "Western & Frontier", "The American frontier and its modern echoes: ranchers, outlaws, lawmen, land disputes, and rugged landscapes."),
  d("sports-drama", "drama", "Sports Drama", "Teams, athletes, and coaches chasing victory — locker rooms, rivalries, and what sport costs and gives the people who live it."),
  d("workplace-drama", "drama", "High-Stakes Workplace", "Ambition and power games inside intense workplaces — finance, tech, media, kitchens — where careers are blood sport."),
  d("small-town-secrets", "drama", "Small Town Secrets", "A crime or disappearance cracks open a close-knit town, exposing buried secrets and the darkness under postcard surfaces."),
  d("survival-wilderness", "drama", "Survival & Wilderness", "People stranded or tested by nature — disasters, expeditions, and the raw fight to stay alive far from civilization."),
  d("faith-religion", "drama", "Faith & Religion", "Belief, doubt, religious communities, cults, and spiritual leaders — the pull and cost of faith."),

  // ── Sci-fi, fantasy & horror ─────────────────────────────────────────────
  d("space-opera", "scifi_fantasy", "Space Opera", "Starships, alien civilizations, and interstellar politics — grand adventures across galaxies with crews you'd follow anywhere."),
  d("hard-scifi", "scifi_fantasy", "Cerebral Sci-Fi", "Idea-driven science fiction about technology, consciousness, and society — thought experiments taken seriously."),
  d("time-travel", "scifi_fantasy", "Time Travel & Loops", "Time machines, loops, paradoxes, and timelines tangled across past and future."),
  d("dystopian", "scifi_fantasy", "Dystopian Future", "Oppressive regimes, surveillance states, and broken societies — futures gone wrong and the people resisting them."),
  d("post-apocalyptic", "scifi_fantasy", "Post-Apocalyptic", "After the collapse — survivors crossing ruined worlds shaped by plague, war, or catastrophe."),
  d("zombie", "scifi_fantasy", "Zombie & Outbreak", "Undead hordes and viral outbreaks; survival groups, quarantine zones, and what people become when civilization falls."),
  d("superhero", "scifi_fantasy", "Superhero", "Costumed heroes and villains with extraordinary powers — comic-book universes, origin stories, and super-team dynamics."),
  d("high-fantasy", "scifi_fantasy", "Epic Fantasy", "Sword-and-sorcery worlds with kingdoms, dragons, prophecies, magic systems, and battles for thrones."),
  d("urban-fantasy", "scifi_fantasy", "Urban & Modern Fantasy", "Magic hidden in the modern world — witches, vampires, demons, and secret supernatural societies next door."),
  d("supernatural-horror", "scifi_fantasy", "Supernatural Horror", "Ghosts, hauntings, demons, and possession — scary stories where the threat is beyond the natural world."),
  d("monster-creature", "scifi_fantasy", "Monsters & Creatures", "Creature features — kaiju, cryptids, and things with teeth hunting from the dark."),
  d("alien-invasion", "scifi_fantasy", "Alien Contact", "First contact and invasion — humanity confronting extraterrestrial intelligence, wonder, and threat."),
  d("cyberpunk-tech", "scifi_fantasy", "Cyberpunk & Tech Noir", "Neon dystopias of hackers, megacorps, AI, androids, and virtual worlds — high tech, low life."),
  d("gothic-horror", "scifi_fantasy", "Gothic Horror", "Candlelit dread — cursed manors, vampires, madness, and romantic doom in the gothic tradition."),

  // ── Comedy ───────────────────────────────────────────────────────────────
  d("classic-sitcom", "comedy", "Classic Sitcom", "Multi-camera or classic-format sitcoms with running gags, catchphrases, and a beloved ensemble hanging out week after week."),
  d("workplace-comedy", "comedy", "Workplace Comedy", "Offices, precincts, schools, and shops where coworkers become dysfunctional family; ensemble banter and petty workplace absurdity."),
  d("romcom", "comedy", "Romantic Comedy", "Charming, funny love stories — meet-cutes, mishaps, and couples the audience roots for."),
  d("dark-comedy", "comedy", "Dark Comedy", "Comedy mined from grim subjects — death, crime, despair — with a wicked, transgressive sense of humor."),
  d("mockumentary", "comedy", "Mockumentary", "Fake-documentary comedy with talking heads, awkward camera glances, and cringe-perfect realism."),
  d("cringe-comedy", "comedy", "Cringe Comedy", "Social-awkwardness comedy built on embarrassment, bad decisions, and characters who cannot read the room."),
  d("dramedy", "comedy", "Bittersweet Dramedy", "Half-hour shows that blend genuine sadness and joy — funny on the surface, aching underneath."),
  d("sketch-variety", "comedy", "Sketch & Variety", "Sketch comedy and variety shows — recurring characters, parodies, and rapid-fire bits from a rotating cast."),
  d("family-sitcom", "comedy", "Family Sitcom", "Parents and kids under one roof — lessons learned, chaos managed, and warmth between the laughs."),
  d("hangout-comedy", "comedy", "Hangout Comedy", "Low-stakes comedies about friends talking, dating, and drifting through life together — the pleasure is the company."),
  d("political-satire-comedy", "comedy", "Political & Media Satire", "Comedies skewering politicians, newsrooms, and the powerful — spin, incompetence, and ego played for laughs."),
  d("stoner-slacker", "comedy", "Slacker & Stoner Comedy", "Lovable underachievers, dumb schemes, and hazy misadventures; comedy that never takes anything seriously."),

  // ── Animation & anime ────────────────────────────────────────────────────
  d("shonen-action", "animation", "Shonen Action Anime", "High-energy Japanese action anime — tournaments, power-ups, rivals, and heroes who never give up."),
  d("dark-seinen", "animation", "Dark & Mature Anime", "Mature, violent, psychologically complex anime for adult audiences — moral ambiguity, tragedy, and consequence."),
  d("slice-of-life-anime", "animation", "Slice-of-Life Anime", "Gentle Japanese animation about everyday life — school clubs, friendships, small joys, and quiet feelings."),
  d("isekai-fantasy-anime", "animation", "Isekai & Fantasy Anime", "Characters transported to game-like fantasy worlds — leveling up, guilds, magic, and second lives."),
  d("mecha-scifi-anime", "animation", "Mecha & Sci-Fi Anime", "Giant robots, space wars, and pilots caught in the machinery of conflict — classic and modern mecha."),
  d("romance-anime", "animation", "Romance Anime", "Animated love stories — confessions, misunderstandings, and slow-blooming relationships."),
  d("adult-animation", "animation", "Adult Animation", "Animated comedies and dramas squarely for grown-ups — profane, satirical, weird, and unbound by live-action budgets."),
  d("kids-family-animation", "animation", "Kids & Family Animation", "Animated shows for children and families — adventure, imagination, and humor that works for all ages."),
  d("action-animation-western", "animation", "Animated Action & Adventure", "Western animated action — superheroes, sci-fi, and fantasy adventures with serialized stakes."),

  // ── Reality & documentary ────────────────────────────────────────────────
  d("true-crime-doc", "unscripted", "True Crime Documentary", "Documentary investigations of real murders, cults, fraudsters, and miscarriages of justice — archival footage, interviews, and twists."),
  d("nature-doc", "unscripted", "Nature & Wildlife", "Breathtaking natural-history filmmaking — animals, oceans, and ecosystems captured in stunning detail."),
  d("science-history-doc", "unscripted", "Science & History Docs", "Documentaries that explain — science, space, engineering, ancient history, and how the world came to be."),
  d("sports-doc", "unscripted", "Sports Documentary", "Behind-the-scenes sports storytelling — seasons, dynasties, scandals, and athletes at their limits."),
  d("music-culture-doc", "unscripted", "Music & Pop Culture Docs", "Documentaries on musicians, scenes, fame, and cultural moments — concerts, archives, and rise-and-fall arcs."),
  d("cooking-competition", "unscripted", "Cooking Competition", "Chefs racing the clock — mystery boxes, eliminations, plating pressure, and judges' tables."),
  d("gentle-baking", "unscripted", "Gentle Baking & Crafts", "Kind, low-stakes competition shows about baking and making — encouragement over drama, tents over arenas."),
  d("food-travel", "unscripted", "Food & Travel", "Hosts eating and wandering the world — street food, local kitchens, and culture through cuisine."),
  d("home-renovation", "unscripted", "Home & Renovation", "Transformations of houses and spaces — demolition days, budgets, reveals, and before-and-after satisfaction."),
  d("dating-reality", "unscripted", "Dating Reality", "Singles looking for love under absurd formats — villas, pods, roses, and messy entanglements."),
  d("competition-reality", "unscripted", "Competition Reality", "Contestants scheming and surviving eliminations — alliances, immunity, blindsides, and one winner."),
  d("talent-show", "unscripted", "Talent Shows", "Singing, dancing, and performance competitions — auditions, golden buzzers, and star-is-born moments."),
  d("celebrity-lifestyle", "unscripted", "Celebrity & Lifestyle Reality", "Cameras following the rich, famous, and fabulous — families, feuds, and lifestyles as entertainment."),
  d("game-show", "unscripted", "Game Shows", "Quiz and game formats — buzzers, big boards, cash prizes, and play-along-at-home fun."),
  d("talk-interview", "unscripted", "Talk & Interview", "Late-night desks, daytime couches, and long-form conversations — monologues, celebrity interviews, and topical comedy."),

  // ── Formats ──────────────────────────────────────────────────────────────
  d("limited-miniseries", "format", "Limited Series", "Complete stories told in a single short season — a novel's worth of drama with a real ending, no filler."),
  d("anthology", "format", "Anthology", "Each season or episode tells a new self-contained story with new characters — same signature tone, fresh start every time."),
  d("procedural-episodic", "format", "Case-of-the-Week", "Episodic shows with a satisfying self-contained story every week — easy to drop into anywhere."),
  d("serialized-epic", "format", "Long-Haul Serial", "Heavily serialized sagas where every episode advances one continuous story — mythology, arcs, and payoffs seasons in the making."),
  d("soap-telenovela", "format", "Soaps & Telenovelas", "Daily and long-running serial melodrama — dynasties, amnesia, weddings interrupted, and cliffhangers forever."),
  d("docuseries", "format", "Docuseries", "Multi-episode documentary storytelling that follows one real story or world in depth across a season."),
  d("short-episode", "format", "Quick Episodes", "Shows with very short episodes — perfect bite-sized viewing for a lunch break or one-more-episode momentum."),

  // ── World TV ─────────────────────────────────────────────────────────────
  d("k-drama", "origin", "K-Drama", "Korean series — swoony romance, revenge melodrama, thrillers, and polished storytelling with distinctive Korean sensibilities."),
  d("k-thriller", "origin", "Korean Thriller", "Dark Korean suspense — serial killers, class rage, survival games, and revenge served ice cold."),
  d("j-drama-anime-adjacent", "origin", "J-Drama", "Japanese live-action series — quirky comedies, tender dramas, and manga adaptations with Japanese storytelling rhythms."),
  d("c-drama", "origin", "C-Drama & Wuxia", "Chinese series — historical palace intrigue, wuxia and xianxia fantasy, and sweeping romances."),
  d("british-crime", "origin", "British Crime", "UK crime drama — brooding detectives, rain-slicked procedurals, and morally weary policing from London to the moors."),
  d("british-comedy", "origin", "British Comedy", "UK humor — dry wit, panel-show energy, class satire, and sitcoms that end after two perfect series."),
  d("nordic-noir", "origin", "Nordic Noir", "Scandinavian crime — grey skies, quiet detectives, and darkness beneath orderly Nordic societies."),
  d("spanish-thriller", "origin", "Spanish-Language Thrillers", "Heists, revenge, and twisty suspense from Spain and Latin America — high drama with unmistakable flair."),
  d("latin-telenovela", "origin", "Telenovelas", "Latin American telenovelas — passion, betrayal, family empires, and love against all odds."),
  d("turkish-drama", "origin", "Turkish Drama", "Turkish series — epic romances, family sagas, and historical dramas with sweeping emotion."),
  d("indian-series", "origin", "Indian Series", "Indian television and streaming series — family dramas, thrillers, and stories across India's languages and regions."),
  d("french-series", "origin", "French Series", "French television — stylish thrillers, witty dramas, and Parisian charm."),
  d("german-series", "origin", "German Series", "German television — tense thrillers, historical drama, and precision-engineered mysteries."),
  d("aussie-kiwi", "origin", "Australian & NZ", "Series from Australia and New Zealand — outback crime, dry humor, and coastal small-town drama."),
];

export function facetEmbeddingText(facet: FacetDef) {
  return `TV shows in the category "${facet.title}": ${facet.description}`;
}

export function facetByKey(key: string) {
  return FACET_DEFS.find((facet) => facet.key === key) ?? null;
}
