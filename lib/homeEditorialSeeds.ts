export type HomeEditorialSeedGroup = "newOrBack" | "quality" | "quick";
export type HomeEditorialProviderKey =
  | "netflix"
  | "apple_tv"
  | "max"
  | "disney_plus"
  | "hulu"
  | "peacock"
  | "prime_video"
  | "paramount_plus"
  | "mgm_plus";

export type HomeEditorialPlatformKey =
  | HomeEditorialProviderKey
  | "amc_plus"
  | "adult_swim"
  | "history";

export const HOME_EDITORIAL_SEED_VALID_THROUGH_DATES: Record<
  HomeEditorialSeedGroup,
  string
> = {
  newOrBack: "2026-07-12",
  quality: "2026-08-31",
  quick: "2026-08-31",
};

export type HomeEditorialResearchSourceId =
  | "tmdb_live_catalog"
  | "rotten_tomatoes_may_anticipated"
  | "rotten_tomatoes_premiere_calendar"
  | "rotten_tomatoes_best_2025"
  | "rotten_tomatoes_invincible_s3"
  | "rotten_tomatoes_abbott_s5"
  | "about_amazon_off_campus"
  | "marvel_spider_noir_teaser"
  | "paramount_dutton_ranch_launch"
  | "paramount_dutton_ranch_debut"
  | "wbd_house_dragon_s3"
  | "wbd_rick_morty_s9"
  | "axios_may_streaming"
  | "flixpatrol_may_streaming"
  | "flixpatrol_us_streaming_may29"
  | "flixpatrol_us_streaming_may30"
  | "toms_guide_weekly_streaming"
  | "gamesradar_may29_weekend"
  | "toms_guide_hbo_max_june"
  | "wbd_hacks_s5_finale"
  | "thewrap_may29_weekend"
  | "tvline_may24_week"
  | "rotten_tomatoes_may_streaming"
  | "netflix_tudum_four_seasons_s2"
  | "netflix_tudum_good_girl_s2"
  | "netflix_tudum_boroughs"
  | "netflix_tudum_man_on_fire"
  | "netflix_murder_mindfully_series"
  | "netflix_rafa_series"
  | "about_netflix_rafa_may29"
  | "rotten_tomatoes_rafa"
  | "flixpatrol_rafa_may29"
  | "netflix_tudum_sweet_magnolias_s5"
  | "netflix_tudum_avatar_last_airbender_s2"
  | "toms_guide_netflix_june"
  | "about_amazon_elle_prime_video"
  | "netflix_tudum_lord_flies"
  | "netflix_tudum_legends"
  | "netflix_tudum_nemesis"
  | "rotten_tomatoes_boroughs"
  | "toms_guide_netflix_top10_may26"
  | "reelgood_us_streaming_charts_may28"
  | "justwatch_us_tv_charts_may30"
  | "justwatch_us_daily_streaming_charts_may31"
  | "justwatch_us_daily_streaming_charts_jun1"
  | "history_world_war_ii_tom_hanks"
  | "mgmplus_condor_series"
  | "paramount_press_the_madison"
  | "apple_tv_pluribus_series"
  | "prime_video_the_boys_series"
  | "prime_video_invincible_series"
  | "amc_the_terror_series"
  | "hbo_euphoria_series"
  | "apple_tv_widows_bay_series"
  | "apple_tv_your_friends_neighbors_series"
  | "apple_tv_maximum_pleasure_series"
  | "mgm_plus_from_series"
  | "justwatch_widows_bay_may30"
  | "justwatch_from_may30"
  | "justwatch_murder_mindfully_may30"
  | "hulu_testaments_guide"
  | "rotten_tomatoes_testaments_s1"
  | "justwatch_testaments_may30"
  | "hulu_deli_boys_s2"
  | "hulu_not_suitable_work_press"
  | "justwatch_deli_boys_may28"
  | "toms_guide_hulu_may29_weekend"
  | "toms_guide_netflix_may25"
  | "abc_the_bear_s5_watch"
  | "toms_guide_hulu_june"
  | "peacock_mia_series"
  | "toms_guide_mia_watch"
  | "peacock_love_island_usa_s8"
  | "nbcuniversal_love_island_usa_s8_press"
  | "toms_guide_peacock_june"
  | "apple_tv_for_all_mankind_s6_press"
  | "tvline_for_all_mankind_s5_finale"
  | "toms_guide_star_city_watch"
  | "apple_tv_star_city_press"
  | "apple_tv_cape_fear_press"
  | "toms_guide_apple_tv_june"
  | "gamesradar_2026_new_tv"
  | "tvline_june_2026_calendar"
  | "rotten_tomatoes_cape_fear"
  | "rotten_tomatoes_maximum_pleasure_s1"
  | "tvline_maximum_pleasure_review"
  | "disney_plus_sofia_royal_magic"
  | "disney_plus_best_world_antoni"
  | "disney_plus_simpsons_summer"
  | "disney_branded_dragon_striker"
  | "disney_plus_the_beauty_fx"
  | "justwatch_the_beauty_may30"
  | "toms_guide_disney_june";

export type HomeEditorialResearchSource = {
  label: string;
  url: string;
  checkedAt: string;
};

export const HOME_EDITORIAL_RESEARCH_SOURCES: Record<
  HomeEditorialResearchSourceId,
  HomeEditorialResearchSource
> = {
  tmdb_live_catalog: {
    label: "TMDB live catalog payload",
    url: "https://www.themoviedb.org/tv",
    checkedAt: "2026-05-28",
  },
  rotten_tomatoes_may_anticipated: {
    label: "Rotten Tomatoes May anticipated TV",
    url: "https://editorial.rottentomatoes.com/article/most-anticipated-tv-of-may-2026/",
    checkedAt: "2026-05-28",
  },
  rotten_tomatoes_premiere_calendar: {
    label: "Rotten Tomatoes 2026 TV premiere calendar",
    url: "https://editorial.rottentomatoes.com/article/tv-premiere-dates-2026/",
    checkedAt: "2026-05-28",
  },
  rotten_tomatoes_best_2025: {
    label: "Rotten Tomatoes best TV shows of 2025",
    url: "https://editorial.rottentomatoes.com/guide/best-tv-shows-of-2025/",
    checkedAt: "2026-05-28",
  },
  rotten_tomatoes_invincible_s3: {
    label: "Rotten Tomatoes Invincible season 3",
    url: "https://www.rottentomatoes.com/tv/invincible/s03",
    checkedAt: "2026-05-28",
  },
  rotten_tomatoes_abbott_s5: {
    label: "Rotten Tomatoes Abbott Elementary season 5",
    url: "https://www.rottentomatoes.com/tv/abbott_elementary/s05",
    checkedAt: "2026-05-28",
  },
  about_amazon_off_campus: {
    label: "About Amazon Off Campus Prime Video launch",
    url: "https://www.aboutamazon.com/news/entertainment/off-campus-hockey-series-prime-video",
    checkedAt: "2026-05-29",
  },
  marvel_spider_noir_teaser: {
    label: "Marvel Spider-Noir Prime Video teaser",
    url: "https://www.marvel.com/articles/tv-shows/spider-noir-teaser-trailer-nicolas-cage-ben-reilly",
    checkedAt: "2026-05-29",
  },
  paramount_dutton_ranch_launch: {
    label: "Paramount Press Dutton Ranch premiere release",
    url: "https://www.paramountpressexpress.com/paramount-plus/releases/?view=112585-beth-and-rip-fight-for-their-future-dutton-ranch-premieres-may-15-on-paramount-first-look-images-and-teaser-unveil-new-series-starring-cole-hauser-and",
    checkedAt: "2026-05-29",
  },
  paramount_dutton_ranch_debut: {
    label: "Paramount Press Dutton Ranch launch performance",
    url: "https://www.paramountpressexpress.com/paramount-plus/shows/dutton-ranch/releases/?view=112915-dutton-ranch-is-the-biggest-original-series-debut-in-paramount-history",
    checkedAt: "2026-05-29",
  },
  wbd_house_dragon_s3: {
    label: "WBD House of the Dragon season 3 premiere release",
    url: "https://press.wbd.com/ca/media-release/season-three-hbo-original-drama-series-house-dragon-debuts-june-21?language_content_entity=en",
    checkedAt: "2026-05-28",
  },
  wbd_rick_morty_s9: {
    label: "WBD Rick and Morty season 9 premiere release",
    url: "https://press.wbd.com/ca/media-release/new-episodes-rick-and-morty-premiere-may-24-adult-swim?language_content_entity=en",
    checkedAt: "2026-05-28",
  },
  axios_may_streaming: {
    label: "Axios late-May streaming watchlist",
    url: "https://www.axios.com/2026/05/27/what-to-watch-netflix-amazon-apple-star-city",
    checkedAt: "2026-05-28",
  },
  flixpatrol_may_streaming: {
    label: "FlixPatrol May 2026 streaming TV chart",
    url: "https://flixpatrol.com/calendar/top/tv-shows/streaming/2026-05/",
    checkedAt: "2026-05-28",
  },
  flixpatrol_us_streaming_may29: {
    label: "FlixPatrol US streaming provider charts May 29",
    url: "https://flixpatrol.com/top10/streaming/united-states/2026-05-29/",
    checkedAt: "2026-05-30",
  },
  flixpatrol_us_streaming_may30: {
    label: "FlixPatrol US streaming provider charts May 30",
    url: "https://flixpatrol.com/top10/streaming/united-states/2026-05-30/",
    checkedAt: "2026-05-30",
  },
  toms_guide_weekly_streaming: {
    label: "Tom's Guide weekly streaming picks",
    url: "https://www.tomsguide.com/entertainment/streaming/5-top-new-shows-to-stream-this-week-hacks-finale-four-seasons-and-more-may-25-31",
    checkedAt: "2026-05-28",
  },
  gamesradar_may29_weekend: {
    label: "GamesRadar May 29-31 streaming picks",
    url: "https://www.gamesradar.com/entertainment/streaming-services/new-shows-movies-to-stream-may-29-31/",
    checkedAt: "2026-05-30",
  },
  toms_guide_hbo_max_june: {
    label: "Tom's Guide HBO Max June 2026 watchlist",
    url: "https://www.tomsguide.com/entertainment/hbo-max/new-on-hbo-max-in-june-2026-all-the-new-shows-and-movies-to-watch-this-month",
    checkedAt: "2026-05-28",
  },
  wbd_hacks_s5_finale: {
    label: "WBD Hacks final season release",
    url: "https://press.wbd.com/us/media-release/hbo-max/hacks-returns-its-fifth-and-final-season-april-9-hbo-max",
    checkedAt: "2026-05-30",
  },
  thewrap_may29_weekend: {
    label: "TheWrap May 29-31 streaming weekend picks",
    url: "https://www.thewrap.com/creative-content/what-to-watch/best-new-movies-shows-streaming-this-weekend-may-29-31/",
    checkedAt: "2026-05-29",
  },
  tvline_may24_week: {
    label: "TVLine May 24 weekly what-to-watch schedule",
    url: "https://www.tvline.com/2179542/what-to-watch-week-of-may-24-2026-tv-shows-movies/",
    checkedAt: "2026-05-29",
  },
  rotten_tomatoes_may_streaming: {
    label: "Rotten Tomatoes May 2026 streaming guide",
    url: "https://editorial.rottentomatoes.com/article/new-movies-and-shows-streaming-in-may-2026-what-to-watch-on-netflix-prime-video-hbo-max-disney-and-more/",
    checkedAt: "2026-05-29",
  },
  netflix_tudum_four_seasons_s2: {
    label: "Netflix Tudum The Four Seasons season 2",
    url: "https://www.netflix.com/tudum/articles/the-four-seasons-season-2-news-photos-release-date",
    checkedAt: "2026-05-29",
  },
  netflix_tudum_good_girl_s2: {
    label: "Netflix Tudum A Good Girl's Guide to Murder season 2",
    url: "https://www.netflix.com/tudum/articles/a-good-girls-guide-to-murder-season-2",
    checkedAt: "2026-05-28",
  },
  netflix_tudum_boroughs: {
    label: "Netflix Tudum The Boroughs",
    url: "https://www.netflix.com/tudum/articles/the-boroughs-duffer-brothers-new-series",
    checkedAt: "2026-05-29",
  },
  netflix_tudum_man_on_fire: {
    label: "Netflix Tudum Man on Fire",
    url: "https://www.netflix.com/tudum/articles/man-on-fire-tv-series-adaptation",
    checkedAt: "2026-05-30",
  },
  netflix_murder_mindfully_series: {
    label: "Netflix Murder Mindfully series page",
    url: "https://www.netflix.com/title/81554969",
    checkedAt: "2026-05-30",
  },
  netflix_rafa_series: {
    label: "Netflix Rafa series page",
    url: "https://www.netflix.com/title/81785900",
    checkedAt: "2026-05-30",
  },
  about_netflix_rafa_may29: {
    label: "About Netflix Rafa May 29 premiere",
    url: "https://about.netflix.com/en/news/rafa-the-rafael-nadal-documentary-premieres-on-netflix-on-may-29",
    checkedAt: "2026-05-30",
  },
  rotten_tomatoes_rafa: {
    label: "Rotten Tomatoes Rafa season 1",
    url: "https://www.rottentomatoes.com/tv/rafa",
    checkedAt: "2026-05-30",
  },
  flixpatrol_rafa_may29: {
    label: "FlixPatrol Rafa May 29 VOD calendar",
    url: "https://flixpatrol.com/",
    checkedAt: "2026-05-30",
  },
  netflix_tudum_sweet_magnolias_s5: {
    label: "Netflix Tudum Sweet Magnolias season 5 trailer",
    url: "https://www.netflix.com/tudum/videos/sweet-magnolias-season-5-watch-trailer",
    checkedAt: "2026-05-30",
  },
  netflix_tudum_avatar_last_airbender_s2: {
    label: "Netflix Tudum Avatar: The Last Airbender season 2 release",
    url: "https://www.netflix.com/tudum/articles/avatar-the-last-airbender-season-2-release-date",
    checkedAt: "2026-05-30",
  },
  toms_guide_netflix_june: {
    label: "Tom's Guide Netflix June 2026 watchlist",
    url: "https://www.tomsguide.com/entertainment/netflix/new-on-netflix-in-june-2026-5-best-movies-and-shows-to-stream-plus-full-release-list",
    checkedAt: "2026-05-30",
  },
  about_amazon_elle_prime_video: {
    label: "About Amazon Elle Prime Video trailer and premiere",
    url: "https://www.aboutamazon.com/news/entertainment/elle-prime-video-legally-blonde",
    checkedAt: "2026-05-30",
  },
  netflix_tudum_lord_flies: {
    label: "Netflix Tudum Lord of the Flies",
    url: "https://www.netflix.com/tudum/articles/lord-of-flies-series-cast-release-date-news",
    checkedAt: "2026-05-29",
  },
  netflix_tudum_legends: {
    label: "Netflix Tudum Legends",
    url: "https://www.netflix.com/tudum/articles/legends-release-date-cast-news",
    checkedAt: "2026-05-29",
  },
  netflix_tudum_nemesis: {
    label: "Netflix Tudum Nemesis",
    url: "https://www.netflix.com/tudum/articles/nemesis-release-date-cast-news",
    checkedAt: "2026-05-29",
  },
  rotten_tomatoes_boroughs: {
    label: "Rotten Tomatoes The Boroughs season 1",
    url: "https://www.rottentomatoes.com/tv/the_boroughs",
    checkedAt: "2026-05-29",
  },
  toms_guide_netflix_top10_may26: {
    label: "Tom's Guide Netflix US top 10 May 26-June 1",
    url: "https://www.tomsguide.com/entertainment/netflix/best-netflix-top-10-shows-top-3-series-you-need-to-binge-watch-this-week-may-26-june-1",
    checkedAt: "2026-05-29",
  },
  reelgood_us_streaming_charts_may28: {
    label: "Reelgood US streaming charts May 21-27",
    url: "https://blog.reelgood.com/category/general/top-10",
    checkedAt: "2026-05-30",
  },
  justwatch_us_tv_charts_may30: {
    label: "JustWatch US TV streaming chart",
    url: "https://www.justwatch.com/us/tv-shows?sort=popular",
    checkedAt: "2026-05-30",
  },
  justwatch_us_daily_streaming_charts_may31: {
    label: "JustWatch daily US TV streaming chart",
    url: "https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows",
    checkedAt: "2026-05-31",
  },
  justwatch_us_daily_streaming_charts_jun1: {
    label: "JustWatch daily US TV streaming chart",
    url: "https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows",
    checkedAt: "2026-06-01",
  },
  history_world_war_ii_tom_hanks: {
    label: "HISTORY World War II with Tom Hanks series page",
    url: "https://www.history.com/shows/world-war-ii-with-tom-hanks",
    checkedAt: "2026-06-01",
  },
  mgmplus_condor_series: {
    label: "MGM+ Condor series page",
    url: "https://www.mgmplus.com/series/condor",
    checkedAt: "2026-06-01",
  },
  paramount_press_the_madison: {
    label: "Paramount Press Express The Madison series page",
    url: "https://www.paramountpressexpress.com/paramount-plus/shows/the-madison/",
    checkedAt: "2026-06-01",
  },
  apple_tv_pluribus_series: {
    label: "Apple TV Pluribus series page",
    url: "https://tv.apple.com/us/show/pluribus/umc.cmc.37axgovs2yozlyh3c2cmwzlza",
    checkedAt: "2026-06-01",
  },
  prime_video_the_boys_series: {
    label: "Prime Video The Boys series page",
    url: "https://www.primevideo.com/detail/The-Boys/0KRGHGZCHKS920ZQGY5LBRF7MA",
    checkedAt: "2026-05-30",
  },
  prime_video_invincible_series: {
    label: "Prime Video Invincible series page",
    url: "https://www.primevideo.com/detail/Invincible/0K677J96WQ96K6UY6BL15O70CO",
    checkedAt: "2026-06-01",
  },
  amc_the_terror_series: {
    label: "AMC The Terror series page",
    url: "https://www.amc.com/shows/the-terror",
    checkedAt: "2026-06-01",
  },
  hbo_euphoria_series: {
    label: "HBO Euphoria series page",
    url: "https://www.hbo.com/euphoria",
    checkedAt: "2026-05-30",
  },
  apple_tv_widows_bay_series: {
    label: "Apple TV Widow's Bay series page",
    url: "https://tv.apple.com/us/show/widows-bay/umc.cmc.1zzly0vah46bnvnwf0qkrjhh2?ctx_agid=7f59e6ed",
    checkedAt: "2026-05-30",
  },
  apple_tv_your_friends_neighbors_series: {
    label: "Apple TV Your Friends & Neighbors series page",
    url: "https://tv.apple.com/us/show/your-friends--neighbors/umc.cmc.74o37kzay0yuuub8iumddjsg",
    checkedAt: "2026-05-30",
  },
  apple_tv_maximum_pleasure_series: {
    label: "Apple TV Maximum Pleasure Guaranteed series page",
    url: "https://tv.apple.com/us/show/maximum-pleasure-guaranteed/umc.cmc.10k6tes7rmc2ti0ho1ozgwezc",
    checkedAt: "2026-05-30",
  },
  mgm_plus_from_series: {
    label: "MGM+ FROM series page",
    url: "https://www.mgmplus.com/series/from",
    checkedAt: "2026-05-30",
  },
  justwatch_widows_bay_may30: {
    label: "JustWatch Widow's Bay US chart",
    url: "https://www.justwatch.com/us/tv-show/widows-bay",
    checkedAt: "2026-05-30",
  },
  justwatch_from_may30: {
    label: "JustWatch FROM US chart",
    url: "https://www.justwatch.com/us/tv-show/from",
    checkedAt: "2026-05-30",
  },
  justwatch_murder_mindfully_may30: {
    label: "JustWatch Murder Mindfully season 2 US chart",
    url: "https://www.justwatch.com/us/tv-show/murder-mindfully/season-2",
    checkedAt: "2026-05-30",
  },
  hulu_testaments_guide: {
    label: "Hulu guide The Testaments",
    url: "https://www.hulu.com/guides/the-testaments",
    checkedAt: "2026-05-30",
  },
  rotten_tomatoes_testaments_s1: {
    label: "Rotten Tomatoes The Testaments season 1",
    url: "https://www.rottentomatoes.com/tv/the_testaments",
    checkedAt: "2026-05-30",
  },
  justwatch_testaments_may30: {
    label: "JustWatch The Testaments US chart",
    url: "https://www.justwatch.com/us/tv-show/the-testaments",
    checkedAt: "2026-05-30",
  },
  hulu_deli_boys_s2: {
    label: "Hulu press Deli Boys season 2",
    url: "https://press.hulu.com/shows/deli-boys/press-releases/",
    checkedAt: "2026-05-28",
  },
  hulu_not_suitable_work_press: {
    label: "Hulu press Not Suitable for Work",
    url: "https://press.hulu.com/shows/not-suitable-for-work/",
    checkedAt: "2026-05-30",
  },
  justwatch_deli_boys_may28: {
    label: "JustWatch Deli Boys US chart",
    url: "https://www.justwatch.com/us/tv-show/deli-boys",
    checkedAt: "2026-05-28",
  },
  toms_guide_hulu_may29_weekend: {
    label: "Tom's Guide Hulu May 29-31 weekend picks",
    url: "https://www.tomsguide.com/entertainment/hulu/3-new-hulu-shows-you-need-to-binge-watch-this-weekend-may-29-31-2026",
    checkedAt: "2026-05-30",
  },
  toms_guide_netflix_may25: {
    label: "Tom's Guide Netflix May 25-31 streaming picks",
    url: "https://www.tomsguide.com/entertainment/netflix/5-new-netflix-movies-and-shows-you-need-to-stream-this-week-may-25-31-2026",
    checkedAt: "2026-05-30",
  },
  abc_the_bear_s5_watch: {
    label: "ABC Updates The Bear season 5 watch guide",
    url: "https://abc.com/news/1ad1c424-d88a-4bd8-825e-d5893c9067f6/category/1138628",
    checkedAt: "2026-05-30",
  },
  toms_guide_hulu_june: {
    label: "Tom's Guide Hulu June 2026 watchlist",
    url: "https://www.tomsguide.com/entertainment/hulu/new-on-hulu-in-june-2026-all-the-new-shows-and-movies-to-watch",
    checkedAt: "2026-05-30",
  },
  peacock_mia_series: {
    label: "Peacock M.I.A. streaming page",
    url: "https://www.peacocktv.com/blog/mia-streaming-peacock-how-to-watch-crime-drama-show-cary-elwes-shannon-gisela",
    checkedAt: "2026-05-30",
  },
  toms_guide_mia_watch: {
    label: "Tom's Guide M.I.A. streaming guide",
    url: "https://www.tomsguide.com/entertainment/streaming/watch-m.i.a",
    checkedAt: "2026-05-30",
  },
  peacock_love_island_usa_s8: {
    label: "Peacock Love Island USA season 8 watch guide",
    url: "https://www.peacocktv.com/blog/where-how-to-watch-love-island-usa-season-8",
    checkedAt: "2026-05-30",
  },
  nbcuniversal_love_island_usa_s8_press: {
    label: "NBCUniversal Love Island USA season 8 slate release",
    url: "https://www.nbcuniversal.com/article/peacock-renews-love-island-usa-season-eight-and-announces-premiere-dates-upcoming-slate",
    checkedAt: "2026-05-30",
  },
  toms_guide_peacock_june: {
    label: "Tom's Guide Peacock June 2026 watchlist",
    url: "https://www.tomsguide.com/entertainment/peacock/new-on-peacock-in-june-2026-all-the-new-shows-and-movies-to-watch",
    checkedAt: "2026-05-30",
  },
  apple_tv_for_all_mankind_s6_press: {
    label: "Apple TV For All Mankind season 5 finale schedule",
    url: "https://www.apple.com/tv-pr/news/2026/03/apple-tv-renews-award-winning-and-globally-acclaimed-space-drama-for-all-mankind-for-sixth-and-final-season/",
    checkedAt: "2026-05-30",
  },
  tvline_for_all_mankind_s5_finale: {
    label: "TVLine For All Mankind season 5 finale recap",
    url: "https://www.tvline.com/2184170/for-all-mankind-recap-season-5-finale-ending-explained/",
    checkedAt: "2026-05-30",
  },
  toms_guide_star_city_watch: {
    label: "Tom's Guide Star City and For All Mankind watch guide",
    url: "https://www.tomsguide.com/entertainment/apple-tv/watch-star-city-online",
    checkedAt: "2026-05-30",
  },
  apple_tv_star_city_press: {
    label: "Apple TV Press Star City release",
    url: "https://www.apple.com/tv-pr/news/2026/04/apples-gripping-new-space-race-drama-star-city-from-award-winning-creators-ben-nedivi-matt-wolpert-and-ronald-d-moore-premieres-at-canneseries/",
    checkedAt: "2026-05-29",
  },
  apple_tv_cape_fear_press: {
    label: "Apple TV Press Cape Fear trailer and premiere",
    url: "https://www.apple.com/tv-pr/news/2026/05/fear-takes-hold-in-new-trailer-for-apple-tvs-psychological-horror-thriller-cape-fear-starring-amy-adams-javier-bardem-and-patrick-wilson/",
    checkedAt: "2026-05-30",
  },
  toms_guide_apple_tv_june: {
    label: "Tom's Guide Apple TV June 2026 watchlist",
    url: "https://www.tomsguide.com/entertainment/apple-tv/everything-new-on-apple-tv-in-june-2026",
    checkedAt: "2026-05-30",
  },
  gamesradar_2026_new_tv: {
    label: "GamesRadar best new TV shows in 2026",
    url: "https://www.gamesradar.com/new-tv-shows/",
    checkedAt: "2026-05-30",
  },
  tvline_june_2026_calendar: {
    label: "TVLine June 2026 what-to-watch calendar",
    url: "https://www.tvline.com/2181094/june-2026-tv-schedule-what-to-watch-printable-calendar-premieres-finales-list/",
    checkedAt: "2026-05-30",
  },
  rotten_tomatoes_cape_fear: {
    label: "Rotten Tomatoes Cape Fear season 1",
    url: "https://www.rottentomatoes.com/tv/cape_fear",
    checkedAt: "2026-05-30",
  },
  rotten_tomatoes_maximum_pleasure_s1: {
    label: "Rotten Tomatoes Maximum Pleasure Guaranteed season 1 reviews",
    url: "https://www.rottentomatoes.com/tv/maximum_pleasure_guaranteed/s01/reviews/top-critics",
    checkedAt: "2026-05-30",
  },
  tvline_maximum_pleasure_review: {
    label: "TVLine Maximum Pleasure Guaranteed review",
    url: "https://www.tvline.com/2177023/maximum-pleasure-guaranteed-review-tatiana-maslany-apple-tv/",
    checkedAt: "2026-05-30",
  },
  disney_plus_sofia_royal_magic: {
    label: "Disney+ Sofia the First: Royal Magic page",
    url: "https://www.disneyplus.com/browse/entity-2f0c2602-557d-46ae-83b9-aab14a1eb9db",
    checkedAt: "2026-05-29",
  },
  disney_plus_best_world_antoni: {
    label: "Disney+ Best of the World with Antoni Porowski page",
    url: "https://www.disneyplus.com/browse/entity-934735ee-4adc-480b-af7d-3ecb7a3ee801",
    checkedAt: "2026-05-29",
  },
  disney_plus_simpsons_summer: {
    label: "Disney+ The Simpsons summer episodes press release",
    url: "https://press.disneyplus.com/news/disney-plus-new-simpsons-summer",
    checkedAt: "2026-05-29",
  },
  disney_branded_dragon_striker: {
    label: "Disney Branded Television Dragon Striker launch release",
    url: "https://www.detpress.com/disneybrandedtelevision/pressrelease/official-trailer-for-new-animated-fantasy-series-dragon-striker-revealed/",
    checkedAt: "2026-05-30",
  },
  disney_plus_the_beauty_fx: {
    label: "Disney+ FX The Beauty watch guide",
    url: "https://www.disneyplus.com/explore/articles/the-beauty-fx",
    checkedAt: "2026-05-30",
  },
  justwatch_the_beauty_may30: {
    label: "JustWatch The Beauty US chart",
    url: "https://www.justwatch.com/us/tv-show/the-beauty",
    checkedAt: "2026-05-30",
  },
  toms_guide_disney_june: {
    label: "Tom's Guide Disney+ June 2026 watchlist",
    url: "https://www.tomsguide.com/entertainment/disney-plus/new-on-disney-in-june-2026-all-the-new-shows-and-movies-to-watch",
    checkedAt: "2026-05-30",
  },
};

export type HomeEditorialSeedRationale =
  | "current_demand"
  | "premiere_calendar"
  | "quality_standout"
  | "quick_watch";

export type HomeEditorialSeedProvenance = {
  researchedAt: string;
  rationale: HomeEditorialSeedRationale;
  sourceIds: HomeEditorialResearchSourceId[];
  note: string;
};

export type HomeEditorialSeedItem = {
  year: number;
  title: string;
  genreIds: number[];
  overview: string;
  posterUrl: string;
  externalId: string;
  backdropUrl: string;
  tmdbVoteCount: number;
  externalSource: "tmdb";
  tmdbPopularity: number;
  tmdbVoteAverage: number;
  homeSignal?: string;
  editorialTier?: "verified_current";
};

type HomeEditorialSeedWindow = {
  validFrom?: string;
  validThrough?: string;
};

export type HomeEditorialSeedAuditIssue =
  | "group_window_expired"
  | "invalid_group_window"
  | "invalid_title_window"
  | "missing_item"
  | "missing_provenance"
  | "unknown_source"
  | "under_sourced"
  | "missing_artwork"
  | "signal_missing_title_window"
  | "current_demand_missing_title_window"
  | "current_demand_missing_official_source"
  | "current_demand_missing_demand_source"
  | "old_current_demand_missing_signal"
  | "current_demand_research_stale"
  | "current_demand_too_few_active_titles"
  | "current_demand_too_few_platforms"
  | "current_demand_platform_overrepresented"
  | "current_demand_too_few_genres"
  | "current_demand_missing_nonfiction_lane"
  | "daily_chart_snapshot_stale"
  | "daily_chart_title_missing_seed"
  | "daily_chart_title_missing_source"
  | "verified_current_missing_signal"
  | "verified_current_missing_official_source";

export type HomeEditorialSeedAuditFinding = {
  issue: HomeEditorialSeedAuditIssue;
  group?: HomeEditorialSeedGroup;
  title?: string;
  sourceId?: string;
  detail?: string;
};

export type HomeEditorialSeedAuditWarningIssue =
  | "current_demand_coverage_expires_soon"
  | "daily_chart_snapshot_expires_soon";

export type HomeEditorialSeedAuditWarning = {
  issue: HomeEditorialSeedAuditWarningIssue;
  effectiveAt: string;
  daysUntil: number;
  expiringTitles?: string[];
  findings: HomeEditorialSeedAuditFinding[];
  detail: string;
};

export type HomeEditorialSeedAuditReport = {
  healthy: boolean;
  checkedAt: number;
  activeTitleCount: number;
  activeCurrentDemandCount: number;
  activeCurrentDemandPlatformCount: number;
  activeCurrentDemandPrimaryGenreCount: number;
  activeCurrentDemandNonfictionCount: number;
  warnings: HomeEditorialSeedAuditWarning[];
  findings: HomeEditorialSeedAuditFinding[];
};

const HOME_EDITORIAL_SEED_ITEMS: Record<string, HomeEditorialSeedItem> = {
  "Off Campus": {
    year: 2026,
    title: "Off Campus",
    genreIds: [18],
    overview:
      "Hannah Wells tutors hockey captain Garrett Graham to win over her crush. Their deal becomes real connection as they face their pasts. Friends Logan, Dean, Tucker, and Allie navigate college life and love.",
    posterUrl: "https://image.tmdb.org/t/p/w500/cbODFqkcmRgrYH8NkG4Q4Hcg8Z1.jpg",
    externalId: "273240",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/52sp0vPhLOWrZ1QoZIWiapronM.jpg",
    tmdbVoteCount: 273,
    externalSource: "tmdb",
    tmdbPopularity: 609.085,
    tmdbVoteAverage: 9.158,
    homeSignal: "Prime May 13",
    editorialTier: "verified_current",
  },
  "Dutton Ranch": {
    year: 2026,
    title: "Dutton Ranch",
    genreIds: [37, 18],
    overview:
      "Rip Wheeler and Beth Dutton gamble everything on a new life in South Texas, but the promise of building a future far from the ghosts of Yellowstone quickly collides with brutal new realities and a rival ranch that will stop at nothing to protect its empire.",
    posterUrl: "https://image.tmdb.org/t/p/w500/xsiecCxd8lkcAluw0wWwbW5CwSv.jpg",
    externalId: "299167",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/ewlmL0nxo2lLqBj69upgp2gjHpV.jpg",
    tmdbVoteCount: 139,
    externalSource: "tmdb",
    tmdbPopularity: 143.8447,
    tmdbVoteAverage: 9.371,
    homeSignal: "Paramount+ May 15",
    editorialTier: "verified_current",
  },
  "Widow's Bay": {
    year: 2026,
    title: "Widow's Bay",
    genreIds: [18, 9648, 35],
    overview:
      "The mayor of a New England town resolves to turn it into the next tourist hot spot, despite local warnings that it's cursed.",
    posterUrl: "https://image.tmdb.org/t/p/w500/5lcxWLVAEICkFpuAiV1aMy7ZZj3.jpg",
    externalId: "270476",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/u6XtMg9Ai9siEbEs0UudPS3EaZY.jpg",
    tmdbVoteCount: 88,
    externalSource: "tmdb",
    tmdbPopularity: 59.5049,
    tmdbVoteAverage: 8.256,
    homeSignal: "Apple TV+ Apr 29",
    editorialTier: "verified_current",
  },
  "World War II with Tom Hanks": {
    year: 2026,
    title: "World War II with Tom Hanks",
    genreIds: [99, 10768],
    overview:
      "Tom Hanks guides a documentary reexamination of World War II, from the invasion of Poland through the atomic age and the human cost of total war.",
    posterUrl: "https://image.tmdb.org/t/p/w500/2ONhd2hXjZHm3ZouH4UsUWm7fPX.jpg",
    externalId: "316992",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/xVN8rq2VM9cvFmM0grv1AFnhO6d.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 18.204,
    tmdbVoteAverage: 0,
    homeSignal: "History now",
    editorialTier: "verified_current",
  },
  Condor: {
    year: 2018,
    title: "Condor",
    genreIds: [80, 18, 9648],
    overview:
      "Young CIA analyst Joe Turner is pulled into a terrorist plot after discovering the agency has been using his algorithm to spy on citizens.",
    posterUrl: "https://image.tmdb.org/t/p/w500/28cIK70tN2t4gPTV8CBQZED1H2G.jpg",
    externalId: "71146",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/fc9ebsTmVCvv6jjD2qT7rWazaej.jpg",
    tmdbVoteCount: 286,
    externalSource: "tmdb",
    tmdbPopularity: 22.416,
    tmdbVoteAverage: 7.0,
    homeSignal: "MGM+ chart",
    editorialTier: "verified_current",
  },
  "The Madison": {
    year: 2026,
    title: "The Madison",
    genreIds: [18, 37],
    overview:
      "The Clyburn family uproots a comfortable New York life for Montana's Madison River Valley while searching for connection and a new future.",
    posterUrl: "https://image.tmdb.org/t/p/w500/nZVRyqVbDqfLSOrLcsGGTUHccZ8.jpg",
    externalId: "225891",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/lhQQE9vlNCKOYWamaHW8CBiI09B.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 16.112,
    tmdbVoteAverage: 0,
    homeSignal: "Paramount+ chart",
    editorialTier: "verified_current",
  },
  Pluribus: {
    year: 2025,
    title: "Pluribus",
    genreIds: [10765, 18],
    overview:
      "The most miserable person on Earth may be the only one who can save the world from happiness.",
    posterUrl: "https://image.tmdb.org/t/p/w500/z7Nga7Q9IGFWs5OEduY2gGFxnX3.jpg",
    externalId: "225171",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/vNCNUxNHHgP0WsA19hxztUsG3yG.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 20.428,
    tmdbVoteAverage: 0,
    homeSignal: "Apple TV+ chart",
    editorialTier: "verified_current",
  },
  "The Pitt": {
    year: 2025,
    title: "The Pitt",
    genreIds: [18],
    overview:
      "The staff of Pittsburgh's Trauma Medical Center work around the clock to save lives in an overcrowded and underfunded emergency department.",
    posterUrl: "https://image.tmdb.org/t/p/w500/kvFSpESyBZMjaeOJDx7RS3P1jey.jpg",
    externalId: "250307",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/z3BkMbCy5ajZPMyKEUwsPHuz2cV.jpg",
    tmdbVoteCount: 754,
    externalSource: "tmdb",
    tmdbPopularity: 69.8696,
    tmdbVoteAverage: 8.747,
  },
  Adolescence: {
    year: 2025,
    title: "Adolescence",
    genreIds: [18, 80],
    overview:
      "When a 13-year-old is accused of the murder of a classmate, his family, therapist and the detective in charge are all left asking: what really happened?",
    posterUrl: "https://image.tmdb.org/t/p/w500/20i4nShZZg1g1VFHSB8xpaYM4r7.jpg",
    externalId: "249042",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/llZodlkVKRkTdUsiRxvn8h80hhx.jpg",
    tmdbVoteCount: 1556,
    externalSource: "tmdb",
    tmdbPopularity: 12.4803,
    tmdbVoteAverage: 7.856,
  },
  "The Studio": {
    year: 2025,
    title: "The Studio",
    genreIds: [35, 18],
    overview:
      "Desperate for celebrity approval, the newly appointed head of a movie studio and his executive team at Continental Studios must juggle corporate demands with creative ambitions as they try to keep movies alive and relevant.",
    posterUrl: "https://image.tmdb.org/t/p/w500/2c6ofLTa5CRfeQjVA1bWiYBdxQN.jpg",
    externalId: "247767",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/j4nrXoHEEHnEgMyoFXUSvXYALFh.jpg",
    tmdbVoteCount: 338,
    externalSource: "tmdb",
    tmdbPopularity: 13.1248,
    tmdbVoteAverage: 7.729,
  },
  "Spider-Noir": {
    year: 2026,
    title: "Spider-Noir",
    genreIds: [80, 9648, 18],
    overview:
      "Ben Reilly, an aging and down on his luck private investigator in 1930s New York, is forced to grapple with his past life as the city's one and only superhero.",
    posterUrl: "https://image.tmdb.org/t/p/w500/oD8WSVqz84ZRfelkr7JPeJwR9Iv.jpg",
    externalId: "220102",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/mkwVoyP9bFSmfVqU8FJyem52hVR.jpg",
    tmdbVoteCount: 42,
    externalSource: "tmdb",
    tmdbPopularity: 269.454,
    tmdbVoteAverage: 9.2,
    homeSignal: "Prime May 27",
    editorialTier: "verified_current",
  },
  "The Boys": {
    year: 2019,
    title: "The Boys",
    genreIds: [10765, 10759],
    overview:
      "A group of vigilantes known informally as The Boys set out to take down corrupt superheroes with blue-collar grit and a willingness to fight dirty.",
    posterUrl: "https://image.tmdb.org/t/p/w500/in1R2dDc421JxsoRWaIIAqVI2KE.jpg",
    externalId: "76479",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/bq28ajZaoMyzEIm6REelqyqtEDZ.jpg",
    tmdbVoteCount: 12750,
    externalSource: "tmdb",
    tmdbPopularity: 648.0994,
    tmdbVoteAverage: 8.5,
    homeSignal: "S5 airing now",
    editorialTier: "verified_current",
  },
  "Star City": {
    year: 2026,
    title: "Star City",
    genreIds: [10765, 18],
    overview:
      "In the same alternate-history universe as For All Mankind, Soviet cosmonauts, engineers, and intelligence officers risk everything in the race for the Moon.",
    posterUrl: "https://image.tmdb.org/t/p/w500/b8VtW6IEIyEWYdnJHx8bG8RdAak.jpg",
    externalId: "252107",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/asROh8ULhbYpB4C7x1Q3iFtcxsB.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 8.0282,
    tmdbVoteAverage: 0,
    homeSignal: "Apple TV+ May 29",
    editorialTier: "verified_current",
  },
  "For All Mankind": {
    year: 2019,
    title: "For All Mankind",
    genreIds: [18, 10765, 10768],
    overview:
      "NASA astronauts, engineers, and their families build an alternate space age where the race never ended and each breakthrough changes life on Earth and beyond.",
    posterUrl: "https://image.tmdb.org/t/p/w500/JP3DItWMbrrLiKR5AYUfpsNf2b.jpg",
    externalId: "87917",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/9OQ5BIITkJwRJo9JA6AlCfJIGBQ.jpg",
    tmdbVoteCount: 934,
    externalSource: "tmdb",
    tmdbPopularity: 77.237,
    tmdbVoteAverage: 7.7,
    homeSignal: "S5 finale May 29",
    editorialTier: "verified_current",
  },
  "Cape Fear": {
    year: 2026,
    title: "Cape Fear",
    genreIds: [18, 80],
    overview:
      "A newly freed killer turns his attention to the attorneys who helped put him away, pulling a married legal couple into a psychological revenge campaign.",
    posterUrl: "https://image.tmdb.org/t/p/w500/64gCOK6NKcXVI2amtVKk3Xx7cbC.jpg",
    externalId: "277439",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/67d7dSnCeGxjbyCXn7giFtjPN2k.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 7.5788,
    tmdbVoteAverage: 0,
    homeSignal: "Apple TV+ Jun 5",
    editorialTier: "verified_current",
  },
  "Maximum Pleasure Guaranteed": {
    year: 2026,
    title: "Maximum Pleasure Guaranteed",
    genreIds: [35],
    overview:
      "A newly divorced mom falls down a dangerous rabbit hole of blackmail, murder, and youth soccer.",
    posterUrl: "https://image.tmdb.org/t/p/w500/f9U0oTlvLlqbww2Gm5j8Lhf1r9W.jpg",
    externalId: "285404",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/9mZlvYlGA4jblCvAvOpinrgn6hr.jpg",
    tmdbVoteCount: 14,
    externalSource: "tmdb",
    tmdbPopularity: 23.1309,
    tmdbVoteAverage: 5.071,
    homeSignal: "Apple TV+ May 20",
    editorialTier: "verified_current",
  },
  "The Four Seasons": {
    year: 2025,
    title: "The Four Seasons",
    genreIds: [35],
    overview:
      "The decades-long friendship between three married couples is tested when one divorces, complicating their tradition of quarterly weekend getaways.",
    posterUrl: "https://image.tmdb.org/t/p/w500/w09XeYl096pwES8riRMZwEA9rnh.jpg",
    externalId: "243316",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/xJATsbyFLf4LMtJBOco08RNxqPE.jpg",
    tmdbVoteCount: 136,
    externalSource: "tmdb",
    tmdbPopularity: 8.8548,
    tmdbVoteAverage: 6.6,
    homeSignal: "S2 May 28",
    editorialTier: "verified_current",
  },
  "A Good Girl's Guide to Murder": {
    year: 2024,
    title: "A Good Girl's Guide to Murder",
    genreIds: [80, 9648, 18],
    overview:
      "After solving the Andie Bell case, Pip Fitz-Amobi is pulled back into danger when a key witness disappears before Max Hastings' trial.",
    posterUrl: "https://image.tmdb.org/t/p/w500/mzkstyDSsTRswCMRvoBD5ULPnIt.jpg",
    externalId: "218342",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/8H3KFYBklgxPiGsc8yWNWqGPZ9G.jpg",
    tmdbVoteCount: 301,
    externalSource: "tmdb",
    tmdbPopularity: 43.5367,
    tmdbVoteAverage: 7.374,
    homeSignal: "S2 May 27",
    editorialTier: "verified_current",
  },
  "The Boroughs": {
    year: 2026,
    title: "The Boroughs",
    genreIds: [10765, 9648],
    overview:
      "In a seemingly perfect retirement community, unlikely neighbors discover an otherworldly threat stealing the one thing they do not have enough of: time.",
    posterUrl: "https://image.tmdb.org/t/p/w500/oKxBWbXmnWFO2Wh1QRTtshdfIRa.jpg",
    externalId: "224941",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/iftYIh1OjJb99EOTHIrDcx59zWb.jpg",
    tmdbVoteCount: 83,
    externalSource: "tmdb",
    tmdbPopularity: 123.2272,
    tmdbVoteAverage: 7.078,
    homeSignal: "Netflix May 21",
    editorialTier: "verified_current",
  },
  "Man on Fire": {
    year: 2026,
    title: "Man on Fire",
    genreIds: [10759, 80],
    overview:
      "Haunted by his past and hunted by his enemies, a Special Forces veteran fights to keep a teenage girl alive on the deadly streets of Rio de Janeiro.",
    posterUrl: "https://image.tmdb.org/t/p/w500/9cZzmT8rhBXbZ1QFBPs3ggABYB3.jpg",
    externalId: "223386",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/dMCfHJRnAZfKoPTjYyZk2QCL8au.jpg",
    tmdbVoteCount: 149,
    externalSource: "tmdb",
    tmdbPopularity: 24.1366,
    tmdbVoteAverage: 7.336,
    homeSignal: "Netflix Top 10",
    editorialTier: "verified_current",
  },
  "Murder Mindfully": {
    year: 2024,
    title: "Murder Mindfully",
    genreIds: [35, 80, 18],
    overview:
      "Mafia lawyer Bjorn Diemel tries to stay mindful while family pressure, police suspicion, and a rival crime boss make his new coping strategies dangerously complicated.",
    posterUrl: "https://image.tmdb.org/t/p/w500/rt6SspSLBl5PqWXGstR7HlUM3Nj.jpg",
    externalId: "252372",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/rsLZK4xAw1Oun0T5UWfG213qalP.jpg",
    tmdbVoteCount: 160,
    externalSource: "tmdb",
    tmdbPopularity: 24,
    tmdbVoteAverage: 7.7,
    homeSignal: "Netflix S2 now",
    editorialTier: "verified_current",
  },
  Rafa: {
    year: 2026,
    title: "Rafa",
    genreIds: [99],
    overview:
      "Rafael Nadal reflects on his career, legacy, family, and final season on the court in an intimate sports documentary series.",
    posterUrl: "https://image.tmdb.org/t/p/w500/utyZY9NKMC0Ci9Rh0ohW9giFKee.jpg",
    externalId: "279884",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/lD3YdWYvFaDI52g9gentsvjB1w5.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 9.2876,
    tmdbVoteAverage: 0,
    homeSignal: "Netflix May 29",
    editorialTier: "verified_current",
  },
  "Sweet Magnolias": {
    year: 2020,
    title: "Sweet Magnolias",
    genreIds: [18],
    overview:
      "Lifelong friends Maddie, Helen, and Dana Sue return to Serenity with new work, romance, and family choices as Netflix's comfort-drama staple pours another season.",
    posterUrl: "https://image.tmdb.org/t/p/w500/n1WDSFOnCCg3cdHHGBywZtYIzf9.jpg",
    externalId: "102904",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/wt60Q4doM2vrubiCsutwaeWncLL.jpg",
    tmdbVoteCount: 261,
    externalSource: "tmdb",
    tmdbPopularity: 14.095,
    tmdbVoteAverage: 7.7,
    homeSignal: "Netflix Jun 11",
    editorialTier: "verified_current",
  },
  "Avatar: The Last Airbender": {
    year: 2024,
    title: "Avatar: The Last Airbender",
    genreIds: [10759, 18, 10751, 10765],
    overview:
      "Aang heads into the Earth Kingdom as the live-action Netflix adventure returns, expanding the journey with earthbending stakes, Ba Sing Se politics, and a bigger ensemble quest.",
    posterUrl: "https://image.tmdb.org/t/p/w500/lzZpWEaqzP0qVA5nkCc5ASbNcSy.jpg",
    externalId: "82452",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/imlTCObfzISogbvcwB1dokoXAIc.jpg",
    tmdbVoteCount: 1096,
    externalSource: "tmdb",
    tmdbPopularity: 23.0142,
    tmdbVoteAverage: 7.758,
    homeSignal: "Netflix Jun 25",
    editorialTier: "verified_current",
  },
  Elle: {
    year: 2026,
    title: "Elle",
    genreIds: [35, 18],
    overview:
      "Prime Video rewinds Elle Woods to high school, following the bright, pink-forward Legally Blonde prequel before Harvard Law and courtroom glory.",
    posterUrl: "https://image.tmdb.org/t/p/w500/aaxl6bYhG6pzhCCe6Oxk5pAesBN.jpg",
    externalId: "254420",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/qDuNYLq4ykp5K4SpAnLp4H38ksy.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 4.3501,
    tmdbVoteAverage: 0,
    homeSignal: "Prime Jul 1",
    editorialTier: "verified_current",
  },
  "Deli Boys": {
    year: 2025,
    title: "Deli Boys",
    genreIds: [18, 35],
    overview:
      "After their father's death, two pampered Pakistani American brothers inherit a convenience-store empire with a dangerous criminal business underneath.",
    posterUrl: "https://image.tmdb.org/t/p/w500/zsjiNaXqbWUCKFyU72N5HpALcUu.jpg",
    externalId: "226346",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/giFTuZsgQK97HqxuVaMlGBgydG6.jpg",
    tmdbVoteCount: 29,
    externalSource: "tmdb",
    tmdbPopularity: 6.2275,
    tmdbVoteAverage: 6.7,
    homeSignal: "S2 May 28",
    editorialTier: "verified_current",
  },
  "The Testaments": {
    year: 2026,
    title: "The Testaments",
    genreIds: [18],
    overview:
      "A new generation of young women raised inside Gilead starts to question the rules, loyalties, and futures chosen for them.",
    posterUrl: "https://image.tmdb.org/t/p/w500/xVsFopLisBoiKdXXecaNTN4pJ9A.jpg",
    externalId: "287527",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/uCndE341njionskk1pK9SbHqwZh.jpg",
    tmdbVoteCount: 115,
    externalSource: "tmdb",
    tmdbPopularity: 56.965,
    tmdbVoteAverage: 8.17,
    homeSignal: "Finale May 27",
    editorialTier: "verified_current",
  },
  "Not Suitable for Work": {
    year: 2026,
    title: "Not Suitable for Work",
    genreIds: [35],
    overview:
      "Five work-obsessed twenty-somethings chase professional success and a little personal life in Manhattan's Murray Hill.",
    posterUrl: "https://image.tmdb.org/t/p/w500/hpucDFIvWwcn6sXk8EOEX0dbY0C.jpg",
    externalId: "284725",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/ysYPo1JqzHiHoIHpW9wXCtvY1LW.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 5.1795,
    tmdbVoteAverage: 0,
    homeSignal: "Hulu Jun 2",
    editorialTier: "verified_current",
  },
  "Lord of the Flies": {
    year: 2026,
    title: "Lord of the Flies",
    genreIds: [18, 10759],
    overview:
      "After a plane crash, a group of schoolboys find themselves stranded on a tropical island without adults, gradually pushing the boys from hope and structure into chaos and tragedy.",
    posterUrl: "https://image.tmdb.org/t/p/w500/zD50ejpus5rNidj6CBr4Ml59KOL.jpg",
    externalId: "270572",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/yRqFvu6rIytqZlzY0pBVvZG3W0S.jpg",
    tmdbVoteCount: 86,
    externalSource: "tmdb",
    tmdbPopularity: 13.5879,
    tmdbVoteAverage: 7.6,
    homeSignal: "Netflix May 4",
    editorialTier: "verified_current",
  },
  Legends: {
    year: 2026,
    title: "Legends",
    genreIds: [10759, 80, 18],
    overview:
      "As drugs flood the streets of '90s Britain, a team of civil servants is thrust undercover to topple the gangs behind it.",
    posterUrl: "https://image.tmdb.org/t/p/w500/dGienbU1xNZJcbY8i8ubJusjDwD.jpg",
    externalId: "262280",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/4CtOMphAmfHJ6cztlAYjkdStkHP.jpg",
    tmdbVoteCount: 59,
    externalSource: "tmdb",
    tmdbPopularity: 25.303,
    tmdbVoteAverage: 7.915,
    homeSignal: "Netflix May 7",
    editorialTier: "verified_current",
  },
  Nemesis: {
    year: 2026,
    title: "Nemesis",
    genreIds: [10759, 18, 80],
    overview:
      "A relentless LAPD cop becomes obsessed with taking down the master thief behind a string of daring heists, and only one can come out on top.",
    posterUrl: "https://image.tmdb.org/t/p/w500/NY7ZwSMw5PjoJdK2CObqiTj7Bm.jpg",
    externalId: "285807",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/pxnJeLSBdUikUOrWdNgrK1HQy2u.jpg",
    tmdbVoteCount: 53,
    externalSource: "tmdb",
    tmdbPopularity: 48.2241,
    tmdbVoteAverage: 7.123,
    homeSignal: "Chart mover",
    editorialTier: "verified_current",
  },
  Euphoria: {
    year: 2019,
    title: "Euphoria",
    genreIds: [18],
    overview:
      "A group of high school students navigate love and friendships in a world of drugs, sex, trauma, and social media.",
    posterUrl: "https://image.tmdb.org/t/p/w500/aJrG7OkoTMPWG5c8opz8a93AZPY.jpg",
    externalId: "85552",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/mez2Z3WqlPKNXpi7mWoiiE5guE9.jpg",
    tmdbVoteCount: 10721,
    externalSource: "tmdb",
    tmdbPopularity: 292.0828,
    tmdbVoteAverage: 8.291,
    homeSignal: "S3 airing now",
    editorialTier: "verified_current",
  },
  FROM: {
    year: 2022,
    title: "FROM",
    genreIds: [9648, 18, 10765],
    overview:
      "A nightmarish town traps everyone who enters. Residents fight for normalcy and a way out while surviving forest creatures that appear after dark.",
    posterUrl: "https://image.tmdb.org/t/p/w500/pRtJagIxpfODzzb0T0NAvZSzErC.jpg",
    externalId: "124364",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/6gN8DYnIEln8v7OhRy61c57w0Xy.jpg",
    tmdbVoteCount: 3372,
    externalSource: "tmdb",
    tmdbPopularity: 654.795,
    tmdbVoteAverage: 8.419,
    homeSignal: "MGM+ S4 airing now",
    editorialTier: "verified_current",
  },
  "The Terror": {
    year: 2018,
    title: "The Terror",
    genreIds: [9648, 18, 10765],
    overview:
      "A chilling anthology series featuring stories of people in terrifying situations inspired by true historical events.",
    posterUrl: "https://images.justwatch.com/poster/56620971/s718/the-terror.jpg",
    externalId: "75191",
    backdropUrl: "https://images.justwatch.com/backdrop/345731264/s1440/the-terror.jpg",
    tmdbVoteCount: 61001,
    externalSource: "tmdb",
    tmdbPopularity: 30.074,
    tmdbVoteAverage: 7.4,
    homeSignal: "AMC+ Jun 4",
    editorialTier: "verified_current",
  },
  "M.I.A.": {
    year: 2026,
    title: "M.I.A.",
    genreIds: [80, 18],
    overview:
      "After her family's drug-running business shatters in tragedy, Etta Tiger Jonze heads through Miami's neon underworld on a revenge mission.",
    posterUrl: "https://image.tmdb.org/t/p/w500/uvocuo6mgQTtNa7O6a3MQoTfuh4.jpg",
    externalId: "262388",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/wqjhAWmqHrIIn4PdchGCuEgPksw.jpg",
    tmdbVoteCount: 62,
    externalSource: "tmdb",
    tmdbPopularity: 31.9312,
    tmdbVoteAverage: 8.435,
    homeSignal: "Peacock May 7",
    editorialTier: "verified_current",
  },
  "Love Island USA": {
    year: 2019,
    title: "Love Island USA",
    genreIds: [10764],
    overview:
      "A new group of Islanders couples up in Fiji as Peacock's daily summer reality tentpole returns with near-real-time romance, recouplings, and audience votes.",
    posterUrl: "https://image.tmdb.org/t/p/w500/kU2y21cls8WargMaX7KI47URMjD.jpg",
    externalId: "90521",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/m0TiLZ79RR19Zz0AZruQSBeH39x.jpg",
    tmdbVoteCount: 165,
    externalSource: "tmdb",
    tmdbPopularity: 17.2647,
    tmdbVoteAverage: 6.9,
    homeSignal: "Peacock Jun 2",
    editorialTier: "verified_current",
  },
  "Your Friends & Neighbors": {
    year: 2025,
    title: "Your Friends & Neighbors",
    genreIds: [18, 80],
    overview:
      "When a financial titan suddenly finds himself divorced and jobless, he starts robbing his wealthy neighbors to stay afloat, gradually getting tangled in a deadly web.",
    posterUrl: "https://image.tmdb.org/t/p/w500/lcp63INKEsVHUly9eayx7gEEOcG.jpg",
    externalId: "241609",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/d8LvQj79fgowZkX4NTZaEG3NwsH.jpg",
    tmdbVoteCount: 228,
    externalSource: "tmdb",
    tmdbPopularity: 41.2129,
    tmdbVoteAverage: 7.643,
    homeSignal: "JustWatch chart #8",
    editorialTier: "verified_current",
  },
  "House of the Dragon": {
    year: 2022,
    title: "House of the Dragon",
    genreIds: [10765, 18, 10759],
    overview:
      "The Targaryen dynasty reaches the height of its power before a succession fight starts tearing the realm and the family apart.",
    posterUrl: "https://image.tmdb.org/t/p/w500/7V0Ebks0GgpKvQ7QbLAIdX5dos4.jpg",
    externalId: "94997",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/2xGcSLyTAzConiHAByWqhfLiatT.jpg",
    tmdbVoteCount: 5943,
    externalSource: "tmdb",
    tmdbPopularity: 63.8196,
    tmdbVoteAverage: 8.3,
    homeSignal: "Returns Jun 21",
    editorialTier: "verified_current",
  },
  Severance: {
    year: 2022,
    title: "Severance",
    genreIds: [18, 9648, 10765],
    overview:
      "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When a mysterious colleague appears outside of work, it begins a journey to discover the truth about their jobs.",
    posterUrl: "https://image.tmdb.org/t/p/w500/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
    externalId: "95396",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/ixgFmf1X59PUZam2qbAfskx2gQr.jpg",
    tmdbVoteCount: 2648,
    externalSource: "tmdb",
    tmdbPopularity: 33.985,
    tmdbVoteAverage: 8.394,
  },
  Andor: {
    year: 2022,
    title: "Andor",
    genreIds: [10765, 10759, 18],
    overview:
      "In an era filled with danger, deception and intrigue, Cassian Andor will discover the difference he can make in the struggle against the tyrannical Galactic Empire.",
    posterUrl: "https://image.tmdb.org/t/p/w500/khZqmwHQicTYoS7Flreb9EddFZC.jpg",
    externalId: "83867",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/AmUhBqsxcenA75T9hV49G6ouO9c.jpg",
    tmdbVoteCount: 2019,
    externalSource: "tmdb",
    tmdbPopularity: 37.9707,
    tmdbVoteAverage: 8.3,
  },
  "Sofia the First: Royal Magic": {
    year: 2026,
    title: "Sofia the First: Royal Magic",
    genreIds: [10762, 16, 10751],
    overview:
      "Sofia attends The Charmswell School for Royal Magic, where she discovers she is the most magical princess in the realm and learns to master her powers with new royal friends.",
    posterUrl: "https://image.tmdb.org/t/p/w500/btMAULyx0ecn7slCxJYQ1aNX7yx.jpg",
    externalId: "261647",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/wGeYd7lVxOzZsbJV7iipK8298hT.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 6.8511,
    tmdbVoteAverage: 0,
    homeSignal: "Disney+ May 25",
    editorialTier: "verified_current",
  },
  "Dragon Striker": {
    year: 2026,
    title: "Dragon Striker",
    genreIds: [16],
    overview:
      "A farm boy discovers he may be the legendary Dragon Striker in a world where soccer-like sport and magic collide.",
    posterUrl: "https://image.tmdb.org/t/p/w500/5aELUnMSAIcJf4CAmcgIWcKmO8c.jpg",
    externalId: "204135",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/hoLPJjPfYdEWJXG1y7OCgOeipaF.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 1.9471,
    tmdbVoteAverage: 0,
    homeSignal: "Disney+ Jun 10",
    editorialTier: "verified_current",
  },
  "Best of the World with Antoni Porowski": {
    year: 2026,
    title: "Best of the World with Antoni Porowski",
    genreIds: [99],
    overview:
      "Antoni Porowski explores food, places to stay, wellness, and hidden corners of global cities with National Geographic's cinematic travel storytelling.",
    posterUrl: "https://image.tmdb.org/t/p/w500/c75V0bZ6iu17ypYYPgDwVICBTUj.jpg",
    externalId: "323039",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/qskzSwDM0e5d8ZAK0MvTNwh2fg7.jpg",
    tmdbVoteCount: 0,
    externalSource: "tmdb",
    tmdbPopularity: 0.3413,
    tmdbVoteAverage: 0,
    homeSignal: "Disney+ Jun 7",
  },
  "The Simpsons": {
    year: 1989,
    title: "The Simpsons",
    genreIds: [10751, 16, 35],
    overview:
      "The animated pop-culture institution follows the Simpson family and the many odd, satirical corners of Springfield.",
    posterUrl: "https://image.tmdb.org/t/p/w500/uWpG7GqfKGQqX4YMAo3nv5OrglV.jpg",
    externalId: "456",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/jIArNHIekrCSVgdMbKPAXpPY03Y.jpg",
    tmdbVoteCount: 10783,
    externalSource: "tmdb",
    tmdbPopularity: 200.9686,
    tmdbVoteAverage: 8.018,
    homeSignal: "Disney+ Jun 17",
  },
  "Slow Horses": {
    year: 2022,
    title: "Slow Horses",
    genreIds: [80, 18, 35],
    overview:
      "Follow a dysfunctional team of MI5 agents and their obnoxious boss, the notorious Jackson Lamb, as they navigate the espionage world's smoke and mirrors to defend England from sinister forces.",
    posterUrl: "https://image.tmdb.org/t/p/w500/dnpatlJrEPiDSn5fzgzvxtiSnMo.jpg",
    externalId: "95480",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/bDfboQUb45Cv9MYyVBDZw8M8xSM.jpg",
    tmdbVoteCount: 849,
    externalSource: "tmdb",
    tmdbPopularity: 31.7705,
    tmdbVoteAverage: 8.012,
  },
  "The Bear": {
    year: 2022,
    title: "The Bear",
    genreIds: [18, 35],
    overview:
      "Carmy, a young fine-dining chef, comes home to Chicago to run his family sandwich shop. As he fights to transform the shop and himself, he works alongside a rough-around-the-edges crew that ultimately reveal themselves as his chosen family.",
    posterUrl: "https://image.tmdb.org/t/p/w500/4fVddnbhcmzRZE14NJY03GKS6Fn.jpg",
    externalId: "136315",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/wHNwlE6ftEpgjVbdhLXOtv1hLs0.jpg",
    tmdbVoteCount: 1713,
    externalSource: "tmdb",
    tmdbPopularity: 35.7643,
    tmdbVoteAverage: 8.16,
    homeSignal: "FX/Hulu Jun 25",
    editorialTier: "verified_current",
  },
  "The Beauty": {
    year: 2026,
    title: "The Beauty",
    genreIds: [18, 10765],
    overview:
      "The world of high fashion turns dark when FBI agents investigate a viral beauty drug that transforms its users but can kill them in horrific ways.",
    posterUrl: "https://image.tmdb.org/t/p/w500/l6mtso50nTSvhYc3tc7xB7cYHmg.jpg",
    externalId: "273160",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/cX6dzeKsBTTXHoG3uQUuhQbqyvq.jpg",
    tmdbVoteCount: 147,
    externalSource: "tmdb",
    tmdbPopularity: 77.415,
    tmdbVoteAverage: 6.5,
    homeSignal: "JustWatch chart #9",
    editorialTier: "verified_current",
  },
  Invincible: {
    year: 2021,
    title: "Invincible",
    genreIds: [16, 18, 10765, 10759],
    overview:
      "Mark Grayson is a normal teenager except for the fact that his father is the most powerful superhero on the planet. Shortly after his seventeenth birthday, Mark begins to develop powers of his own.",
    posterUrl: "https://image.tmdb.org/t/p/w500/4tblBrslcKSifMVZ3TmtT2ukMor.jpg",
    externalId: "95557",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/9qrroces8C6R9aKr08hACNPVXdZ.jpg",
    tmdbVoteCount: 5805,
    externalSource: "tmdb",
    tmdbPopularity: 94.5218,
    tmdbVoteAverage: 8.634,
    homeSignal: "Prime chart",
    editorialTier: "verified_current",
  },
  Hacks: {
    year: 2021,
    title: "Hacks",
    genreIds: [35, 18],
    overview:
      "Explore a dark mentorship that forms between Deborah Vance, a legendary Las Vegas comedian, and an entitled, outcast 25-year-old.",
    posterUrl: "https://image.tmdb.org/t/p/w500/ca5XiEFgyGsI38QT3wEKa1QVGX.jpg",
    externalId: "124101",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/bbAR4qKxjnjyKAt4YMrL725Mtfw.jpg",
    tmdbVoteCount: 345,
    externalSource: "tmdb",
    tmdbPopularity: 41.4756,
    tmdbVoteAverage: 7.4,
    homeSignal: "Finale May 28",
    editorialTier: "verified_current",
  },
  "Abbott Elementary": {
    year: 2021,
    title: "Abbott Elementary",
    genreIds: [35],
    overview:
      "A group of dedicated, passionate teachers and a slightly tone-deaf principal are brought together in a Philadelphia public school where, despite the odds, they are determined to help their students succeed.",
    posterUrl: "https://image.tmdb.org/t/p/w500/nBe1e3JJEZ6veGrVXNF0fRoLu56.jpg",
    externalId: "125935",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/asDINJT3b7tEa76uWI1rZ5TWdJF.jpg",
    tmdbVoteCount: 283,
    externalSource: "tmdb",
    tmdbPopularity: 30.1148,
    tmdbVoteAverage: 7.447,
  },
  Overcompensating: {
    year: 2025,
    title: "Overcompensating",
    genreIds: [35],
    overview:
      "Closeted former football player and homecoming king Benny becomes fast friends with Carmen, a high school outsider on a mission to fit in at all costs.",
    posterUrl: "https://image.tmdb.org/t/p/w500/9g5QRUSPBK4ABLzhO9D8ooir6tS.jpg",
    externalId: "247619",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/vG1nIg9epHFzjqOlyiOlWkeKlXw.jpg",
    tmdbVoteCount: 104,
    externalSource: "tmdb",
    tmdbPopularity: 7.0091,
    tmdbVoteAverage: 7.3,
  },
  "The Rehearsal": {
    year: 2022,
    title: "The Rehearsal",
    genreIds: [35, 99],
    overview:
      "Nathan Fielder allows ordinary people to prepare for life's biggest moments by rehearsing them in carefully crafted simulations of his own design.",
    posterUrl: "https://image.tmdb.org/t/p/w500/mIevNYxovnH4sR22qkUmAgS5vdv.jpg",
    externalId: "204284",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/iFPbB1II79kZNPbT7ePx2W06cd2.jpg",
    tmdbVoteCount: 256,
    externalSource: "tmdb",
    tmdbPopularity: 3.9799,
    tmdbVoteAverage: 8.006,
  },
  "Rick and Morty": {
    year: 2013,
    title: "Rick and Morty",
    genreIds: [16, 35, 10765, 10759],
    overview:
      "A brilliant, reckless scientist drags his anxious grandson through chaotic adventures across the universe and alternate realities.",
    posterUrl: "https://image.tmdb.org/t/p/w500/owhkU6KRqdXoUQpjV8uyZGPtX58.jpg",
    externalId: "60625",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/zJZfxi8X3XPHAhxXseRugtnNVtt.jpg",
    tmdbVoteCount: 10887,
    externalSource: "tmdb",
    tmdbPopularity: 163.7847,
    tmdbVoteAverage: 8.7,
    homeSignal: "S9 airing now",
    editorialTier: "verified_current",
  },
};

const HOME_EDITORIAL_SEED_TITLES: Record<HomeEditorialSeedGroup, string[]> = {
  newOrBack: [
    "Off Campus",
    "Dutton Ranch",
    "Widow's Bay",
    "The Pitt",
    "Adolescence",
    "The Studio",
    "Spider-Noir",
    "The Boys",
    "FROM",
    "The Terror",
    "Star City",
    "Maximum Pleasure Guaranteed",
    "M.I.A.",
    "The Bear",
    "The Four Seasons",
    "A Good Girl's Guide to Murder",
    "The Boroughs",
    "For All Mankind",
    "Cape Fear",
    "Man on Fire",
    "Murder Mindfully",
    "Rafa",
    "Sweet Magnolias",
    "Avatar: The Last Airbender",
    "Elle",
    "Deli Boys",
    "The Testaments",
    "The Beauty",
    "Not Suitable for Work",
    "Love Island USA",
    "Lord of the Flies",
    "Legends",
    "Nemesis",
    "Euphoria",
    "Your Friends & Neighbors",
    "House of the Dragon",
    "Rick and Morty",
    "World War II with Tom Hanks",
    "Condor",
    "The Madison",
    "Pluribus",
    "Dragon Striker",
    "Sofia the First: Royal Magic",
    "Best of the World with Antoni Porowski",
    "The Simpsons",
  ],
  quality: [
    "The Pitt",
    "Severance",
    "Andor",
    "Slow Horses",
    "The Bear",
    "Adolescence",
    "Your Friends & Neighbors",
    "Invincible",
  ],
  quick: [
    "The Studio",
    "Hacks",
    "The Bear",
    "Abbott Elementary",
    "Overcompensating",
    "The Rehearsal",
  ],
};

const HOME_EDITORIAL_PROVIDER_SEED_TITLES: Record<HomeEditorialProviderKey, string[]> = {
  netflix: [
    "A Good Girl's Guide to Murder",
    "The Boroughs",
    "Man on Fire",
    "Murder Mindfully",
    "Rafa",
    "Sweet Magnolias",
    "Avatar: The Last Airbender",
    "Adolescence",
    "Lord of the Flies",
    "The Four Seasons",
  ],
  apple_tv: [
    "Widow's Bay",
    "Your Friends & Neighbors",
    "Pluribus",
    "The Studio",
    "Severance",
    "Slow Horses",
    "Star City",
    "For All Mankind",
    "Cape Fear",
    "Maximum Pleasure Guaranteed",
  ],
  max: [
    "House of the Dragon",
    "Rick and Morty",
    "The Pitt",
    "Hacks",
    "The Rehearsal",
    "Euphoria",
  ],
  disney_plus: [
    "Dragon Striker",
    "Andor",
    "Sofia the First: Royal Magic",
    "Best of the World with Antoni Porowski",
    "The Simpsons",
  ],
  hulu: [
    "Deli Boys",
    "The Testaments",
    "The Beauty",
    "Not Suitable for Work",
    "The Bear",
    "Abbott Elementary",
  ],
  peacock: ["Love Island USA", "M.I.A."],
  prime_video: ["Off Campus", "The Boys", "Elle", "Invincible", "Spider-Noir"],
  paramount_plus: ["Dutton Ranch", "The Madison"],
  mgm_plus: ["FROM", "Condor"],
};

const SEED_DAY_MS = 24 * 60 * 60 * 1000;

const HOME_EDITORIAL_SEED_WINDOWS: Record<string, HomeEditorialSeedWindow> = {
  "Off Campus": { validThrough: "2026-06-21" },
  "Dutton Ranch": { validThrough: "2026-06-21" },
  "Widow's Bay": { validThrough: "2026-06-21" },
  "Spider-Noir": { validThrough: "2026-06-21" },
  "The Boys": { validThrough: "2026-06-21" },
  FROM: { validThrough: "2026-06-28" },
  "The Terror": { validFrom: "2026-06-01", validThrough: "2026-06-21" },
  "Your Friends & Neighbors": { validThrough: "2026-06-21" },
  "M.I.A.": { validFrom: "2026-05-30", validThrough: "2026-06-21" },
  "The Bear": { validFrom: "2026-05-28", validThrough: "2026-07-12" },
  "Star City": { validThrough: "2026-06-21" },
  "For All Mankind": { validFrom: "2026-05-29", validThrough: "2026-06-21" },
  "Cape Fear": { validFrom: "2026-05-30", validThrough: "2026-07-12" },
  "Maximum Pleasure Guaranteed": { validThrough: "2026-06-21" },
  "The Four Seasons": { validThrough: "2026-06-21" },
  "A Good Girl's Guide to Murder": { validThrough: "2026-06-21" },
  "The Boroughs": { validThrough: "2026-06-21" },
  "Man on Fire": { validThrough: "2026-06-21" },
  "Murder Mindfully": { validFrom: "2026-05-30", validThrough: "2026-06-21" },
  Rafa: { validFrom: "2026-05-29", validThrough: "2026-06-21" },
  "Sweet Magnolias": { validFrom: "2026-05-30", validThrough: "2026-07-12" },
  "Avatar: The Last Airbender": { validFrom: "2026-05-30", validThrough: "2026-07-12" },
  Elle: { validFrom: "2026-05-30", validThrough: "2026-07-12" },
  "Deli Boys": { validThrough: "2026-06-21" },
  "The Testaments": { validFrom: "2026-05-27", validThrough: "2026-06-21" },
  "The Beauty": { validThrough: "2026-06-21" },
  "Not Suitable for Work": { validFrom: "2026-05-30", validThrough: "2026-06-28" },
  "Love Island USA": { validFrom: "2026-05-30", validThrough: "2026-07-12" },
  "Lord of the Flies": { validThrough: "2026-06-21" },
  Legends: { validThrough: "2026-06-21" },
  Nemesis: { validThrough: "2026-06-21" },
  Euphoria: { validThrough: "2026-06-21" },
  "House of the Dragon": { validFrom: "2026-05-28", validThrough: "2026-07-12" },
  "Rick and Morty": { validFrom: "2026-05-28", validThrough: "2026-07-12" },
  "World War II with Tom Hanks": { validFrom: "2026-06-01", validThrough: "2026-06-28" },
  Condor: { validFrom: "2026-06-01", validThrough: "2026-06-28" },
  "The Madison": { validFrom: "2026-06-01", validThrough: "2026-06-28" },
  Invincible: { validFrom: "2026-06-01", validThrough: "2026-06-28" },
  Pluribus: { validFrom: "2026-06-01", validThrough: "2026-06-28" },
  "Dragon Striker": { validFrom: "2026-05-30", validThrough: "2026-07-12" },
  "Sofia the First: Royal Magic": { validFrom: "2026-05-29", validThrough: "2026-07-12" },
  "Best of the World with Antoni Porowski": { validFrom: "2026-05-29", validThrough: "2026-07-12" },
  "The Simpsons": { validFrom: "2026-05-29", validThrough: "2026-07-12" },
  Hacks: { validFrom: "2026-05-28", validThrough: "2026-06-21" },
};

const HOME_EDITORIAL_OFFICIAL_SOURCE_BY_TITLE: Record<string, HomeEditorialResearchSourceId> = {
  "Off Campus": "about_amazon_off_campus",
  "Dutton Ranch": "paramount_dutton_ranch_launch",
  "Widow's Bay": "apple_tv_widows_bay_series",
  "Spider-Noir": "marvel_spider_noir_teaser",
  "The Boys": "prime_video_the_boys_series",
  FROM: "mgm_plus_from_series",
  "The Terror": "amc_the_terror_series",
  "Your Friends & Neighbors": "apple_tv_your_friends_neighbors_series",
  "M.I.A.": "peacock_mia_series",
  "The Four Seasons": "netflix_tudum_four_seasons_s2",
  "A Good Girl's Guide to Murder": "netflix_tudum_good_girl_s2",
  "The Boroughs": "netflix_tudum_boroughs",
  "Man on Fire": "netflix_tudum_man_on_fire",
  "Murder Mindfully": "netflix_murder_mindfully_series",
  Rafa: "about_netflix_rafa_may29",
  "Sweet Magnolias": "netflix_tudum_sweet_magnolias_s5",
  "Avatar: The Last Airbender": "netflix_tudum_avatar_last_airbender_s2",
  Elle: "about_amazon_elle_prime_video",
  "Deli Boys": "hulu_deli_boys_s2",
  "The Testaments": "hulu_testaments_guide",
  "The Beauty": "disney_plus_the_beauty_fx",
  "Not Suitable for Work": "hulu_not_suitable_work_press",
  "The Bear": "abc_the_bear_s5_watch",
  "Love Island USA": "peacock_love_island_usa_s8",
  "Lord of the Flies": "netflix_tudum_lord_flies",
  Legends: "netflix_tudum_legends",
  Nemesis: "netflix_tudum_nemesis",
  Euphoria: "hbo_euphoria_series",
  "House of the Dragon": "wbd_house_dragon_s3",
  "Rick and Morty": "wbd_rick_morty_s9",
  "World War II with Tom Hanks": "history_world_war_ii_tom_hanks",
  Condor: "mgmplus_condor_series",
  "The Madison": "paramount_press_the_madison",
  Invincible: "prime_video_invincible_series",
  Pluribus: "apple_tv_pluribus_series",
  Hacks: "wbd_hacks_s5_finale",
  "Dragon Striker": "disney_branded_dragon_striker",
  "Star City": "apple_tv_star_city_press",
  "For All Mankind": "apple_tv_for_all_mankind_s6_press",
  "Cape Fear": "apple_tv_cape_fear_press",
  "Maximum Pleasure Guaranteed": "apple_tv_maximum_pleasure_series",
  "Sofia the First: Royal Magic": "disney_plus_sofia_royal_magic",
  "Best of the World with Antoni Porowski": "disney_plus_best_world_antoni",
  "The Simpsons": "disney_plus_simpsons_summer",
};

const HOME_EDITORIAL_PLATFORM_BY_TITLE: Record<string, HomeEditorialPlatformKey> = {
  "Off Campus": "prime_video",
  "Dutton Ranch": "paramount_plus",
  "Widow's Bay": "apple_tv",
  "Spider-Noir": "prime_video",
  "The Boys": "prime_video",
  FROM: "mgm_plus",
  "The Terror": "amc_plus",
  "Your Friends & Neighbors": "apple_tv",
  "M.I.A.": "peacock",
  "Star City": "apple_tv",
  "For All Mankind": "apple_tv",
  "Cape Fear": "apple_tv",
  "Maximum Pleasure Guaranteed": "apple_tv",
  "The Four Seasons": "netflix",
  "A Good Girl's Guide to Murder": "netflix",
  "The Boroughs": "netflix",
  "Man on Fire": "netflix",
  "Murder Mindfully": "netflix",
  Rafa: "netflix",
  "Sweet Magnolias": "netflix",
  "Avatar: The Last Airbender": "netflix",
  Elle: "prime_video",
  "Deli Boys": "hulu",
  "The Testaments": "hulu",
  "The Beauty": "hulu",
  "Not Suitable for Work": "hulu",
  "The Bear": "hulu",
  "Love Island USA": "peacock",
  "Lord of the Flies": "netflix",
  Legends: "netflix",
  Nemesis: "netflix",
  Euphoria: "max",
  "House of the Dragon": "max",
  "Dragon Striker": "disney_plus",
  "Rick and Morty": "max",
  "World War II with Tom Hanks": "history",
  Condor: "mgm_plus",
  "The Madison": "paramount_plus",
  Invincible: "prime_video",
  Pluribus: "apple_tv",
  "Sofia the First: Royal Magic": "disney_plus",
  "Best of the World with Antoni Porowski": "disney_plus",
  "The Simpsons": "disney_plus",
};

const MIN_ACTIVE_CURRENT_DEMAND_PLATFORMS = 5;
const MIN_ACTIVE_CURRENT_DEMAND_ITEMS = 8;
const MIN_ACTIVE_CURRENT_DEMAND_PRIMARY_GENRES = 4;
const MAX_ACTIVE_CURRENT_DEMAND_PLATFORM_SHARE = 0.5;
const MIN_ACTIVE_CURRENT_DEMAND_NONFICTION_ITEMS = 1;
const CURRENT_DEMAND_COVERAGE_LOOKAHEAD_DAYS = 30;
const DAILY_CHART_REFRESH_WARNING_DAYS = 2;
const NONFICTION_TV_GENRE_IDS = new Set([99, 10763, 10764, 10767]);

export const HOME_EDITORIAL_DEMAND_SOURCE_IDS: HomeEditorialResearchSourceId[] = [
  "rotten_tomatoes_may_anticipated",
  "rotten_tomatoes_premiere_calendar",
  "axios_may_streaming",
  "flixpatrol_may_streaming",
  "flixpatrol_us_streaming_may29",
  "flixpatrol_us_streaming_may30",
  "toms_guide_weekly_streaming",
  "gamesradar_may29_weekend",
  "toms_guide_hbo_max_june",
  "thewrap_may29_weekend",
  "tvline_may24_week",
  "rotten_tomatoes_may_streaming",
  "rotten_tomatoes_boroughs",
  "toms_guide_netflix_top10_may26",
  "reelgood_us_streaming_charts_may28",
  "justwatch_us_tv_charts_may30",
  "justwatch_us_daily_streaming_charts_may31",
  "justwatch_us_daily_streaming_charts_jun1",
  "justwatch_widows_bay_may30",
  "justwatch_from_may30",
  "justwatch_murder_mindfully_may30",
  "rotten_tomatoes_rafa",
  "flixpatrol_rafa_may29",
  "toms_guide_netflix_june",
  "justwatch_testaments_may30",
  "justwatch_the_beauty_may30",
  "justwatch_deli_boys_may28",
  "toms_guide_hulu_may29_weekend",
  "toms_guide_peacock_june",
  "tvline_for_all_mankind_s5_finale",
  "toms_guide_star_city_watch",
  "toms_guide_apple_tv_june",
  "gamesradar_2026_new_tv",
  "tvline_june_2026_calendar",
  "rotten_tomatoes_cape_fear",
  "toms_guide_netflix_may25",
  "toms_guide_hulu_june",
  "toms_guide_mia_watch",
  "paramount_dutton_ranch_debut",
  "rotten_tomatoes_maximum_pleasure_s1",
  "tvline_maximum_pleasure_review",
  "toms_guide_disney_june",
];

const HOME_EDITORIAL_DEMAND_SOURCE_WEIGHTS: Partial<
  Record<HomeEditorialResearchSourceId, number>
> = {
  justwatch_us_daily_streaming_charts_jun1: 38,
  justwatch_us_daily_streaming_charts_may31: 36,
  reelgood_us_streaming_charts_may28: 30,
  flixpatrol_us_streaming_may30: 30,
  flixpatrol_us_streaming_may29: 26,
  justwatch_us_tv_charts_may30: 24,
  justwatch_widows_bay_may30: 22,
  justwatch_from_may30: 22,
  justwatch_murder_mindfully_may30: 18,
  flixpatrol_rafa_may29: 18,
  justwatch_testaments_may30: 18,
  justwatch_the_beauty_may30: 20,
  justwatch_deli_boys_may28: 18,
  toms_guide_netflix_top10_may26: 18,
  flixpatrol_may_streaming: 16,
  gamesradar_may29_weekend: 14,
  thewrap_may29_weekend: 14,
  toms_guide_weekly_streaming: 12,
  toms_guide_netflix_may25: 12,
  toms_guide_netflix_june: 12,
  toms_guide_hbo_max_june: 12,
  toms_guide_hulu_june: 12,
  toms_guide_hulu_may29_weekend: 12,
  toms_guide_mia_watch: 12,
  toms_guide_peacock_june: 12,
  toms_guide_star_city_watch: 12,
  toms_guide_apple_tv_june: 12,
  gamesradar_2026_new_tv: 12,
  tvline_june_2026_calendar: 10,
  rotten_tomatoes_cape_fear: 10,
  toms_guide_disney_june: 12,
  tvline_may24_week: 10,
  tvline_for_all_mankind_s5_finale: 10,
  rotten_tomatoes_may_streaming: 10,
  rotten_tomatoes_boroughs: 10,
  rotten_tomatoes_maximum_pleasure_s1: 10,
  tvline_maximum_pleasure_review: 10,
  axios_may_streaming: 9,
  paramount_dutton_ranch_debut: 9,
  rotten_tomatoes_may_anticipated: 8,
  rotten_tomatoes_premiere_calendar: 8,
};

export const HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART = {
  country: "US",
  period: "daily",
  checkedAt: "2026-06-01",
  maxAgeDays: 7,
  sourceId: "justwatch_us_daily_streaming_charts_jun1",
  titles: [
    "Spider-Noir",
    "Widow's Bay",
    "FROM",
    "The Boroughs",
    "Euphoria",
    "Off Campus",
    "The Four Seasons",
    "Hacks",
    "The Terror",
    "Your Friends & Neighbors",
  ],
  alternateTitleOrders: [
    [
      "Spider-Noir",
      "Widow's Bay",
      "FROM",
      "The Boroughs",
      "Euphoria",
      "Off Campus",
      "The Four Seasons",
      "Hacks",
      "Your Friends & Neighbors",
      "The Terror",
    ],
    [
      "Spider-Noir",
      "Widow's Bay",
      "FROM",
      "Euphoria",
      "The Boroughs",
      "Off Campus",
      "The Four Seasons",
      "Hacks",
      "Your Friends & Neighbors",
      "The Terror",
    ],
    [
      "Spider-Noir",
      "Widow's Bay",
      "Euphoria",
      "FROM",
      "The Boroughs",
      "Off Campus",
      "The Four Seasons",
      "Hacks",
      "Your Friends & Neighbors",
      "Rick and Morty",
    ],
    [
      "Spider-Noir",
      "Widow's Bay",
      "Euphoria",
      "The Boroughs",
      "FROM",
      "Off Campus",
      "The Four Seasons",
      "Hacks",
      "Your Friends & Neighbors",
      "Rick and Morty",
    ],
    [
      "Spider-Noir",
      "Widow's Bay",
      "Euphoria",
      "The Boroughs",
      "FROM",
      "Off Campus",
      "The Four Seasons",
      "Rick and Morty",
      "Hacks",
      "Your Friends & Neighbors",
    ],
    [
      "Spider-Noir",
      "Widow's Bay",
      "Euphoria",
      "The Boroughs",
      "FROM",
      "Rick and Morty",
      "Off Campus",
      "The Four Seasons",
      "Your Friends & Neighbors",
      "Hacks",
    ],
    [
      "Spider-Noir",
      "Widow's Bay",
      "Euphoria",
      "The Boroughs",
      "The Four Seasons",
      "Off Campus",
      "Rick and Morty",
      "Your Friends & Neighbors",
      "FROM",
      "Hacks",
    ],
    [
      "Widow's Bay",
      "Spider-Noir",
      "Euphoria",
      "Off Campus",
      "The Boroughs",
      "Love Island USA",
      "The Four Seasons",
      "Rick and Morty",
      "FROM",
      "The Beauty",
    ],
    [
      "Widow's Bay",
      "Spider-Noir",
      "Euphoria",
      "Off Campus",
      "The Boroughs",
      "Love Island USA",
      "The Four Seasons",
      "Rick and Morty",
      "The Beauty",
      "FROM",
    ],
    [
      "Widow's Bay",
      "Spider-Noir",
      "Love Island USA",
      "The Boroughs",
      "Off Campus",
      "The Four Seasons",
      "Euphoria",
      "Not Suitable for Work",
      "FROM",
      "Hacks",
    ],
    [
      "FROM",
      "Off Campus",
      "Your Friends & Neighbors",
      "Rick and Morty",
      "The Boys",
      "World War II with Tom Hanks",
      "Condor",
      "The Madison",
      "Invincible",
      "Pluribus",
    ],
  ],
} as const;

export const HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES =
  HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.titles;
const HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_BOOST_BASE = 60;
const HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_RANK_STEP = 4;
const HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_RANK_BY_TITLE = new Map(
  HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES.map((title, index) => [
    title.toLowerCase().replace(/\s+/g, " "),
    index + 1,
  ]),
);

function getHomeEditorialAcceptedDailyChartTitles() {
  return [
    ...new Set([
      ...HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.titles,
      ...HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.alternateTitleOrders.flat(),
    ]),
  ];
}

const HOME_EDITORIAL_CHART_POSITION_BOOST_BY_TITLE: Record<string, number> = {
  "Dutton Ranch": 16,
  "Maximum Pleasure Guaranteed": 14,
  "The Boys": 12,
  FROM: 12,
  Euphoria: 20,
  "Love Island USA": 20,
  "Avatar: The Last Airbender": 18,
  "Cape Fear": 22,
  Elle: 16,
  Nemesis: 16,
  "Murder Mindfully": 14,
  Rafa: 12,
  "Sweet Magnolias": 12,
  "The Testaments": 14,
  "Dragon Striker": 20,
  "Sofia the First: Royal Magic": 22,
};

const HOME_EDITORIAL_SEED_PROVENANCE: Record<string, HomeEditorialSeedProvenance> = {
  "Off Campus": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "about_amazon_off_campus",
      "rotten_tomatoes_premiere_calendar",
      "flixpatrol_may_streaming",
      "reelgood_us_streaming_charts_may28",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Recent Prime Video launch with chart demand across Reelgood, FlixPatrol, and JustWatch plus calendar validation.",
  },
  "Dutton Ranch": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "paramount_dutton_ranch_launch",
      "paramount_dutton_ranch_debut",
      "rotten_tomatoes_may_anticipated",
      "rotten_tomatoes_premiere_calendar",
      "rotten_tomatoes_may_streaming",
      "flixpatrol_may_streaming",
      "reelgood_us_streaming_charts_may28",
      "justwatch_us_daily_streaming_charts_may31",
    ],
    note: "High-demand May launch with Yellowstone audience pull, Reelgood confirmation, and a current JustWatch daily top-10 signal.",
  },
  "Widow's Bay": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "apple_tv_widows_bay_series",
      "reelgood_us_streaming_charts_may28",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
      "justwatch_widows_bay_may30",
      "rotten_tomatoes_premiere_calendar",
    ],
    note: "Apple TV+ mystery-comedy with Reelgood and JustWatch US top-chart signals plus weekly-episode momentum.",
  },
  "The Pitt": {
    researchedAt: "2026-05-28",
    rationale: "quality_standout",
    sourceIds: [
      "tmdb_live_catalog",
      "rotten_tomatoes_best_2025",
      "flixpatrol_us_streaming_may29",
    ],
    note: "Certified-quality medical drama with same-day HBO Max chart lift to anchor quality and provider-room rails.",
  },
  Adolescence: {
    researchedAt: "2026-05-28",
    rationale: "quality_standout",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_best_2025"],
    note: "Critically validated limited series that prevents the homepage from becoming only franchise IP.",
  },
  "The Studio": {
    researchedAt: "2026-05-28",
    rationale: "quick_watch",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_best_2025"],
    note: "Compact, acclaimed comedy that works as both a taste-forward and short-session recommendation.",
  },
  "Spider-Noir": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "marvel_spider_noir_teaser",
      "rotten_tomatoes_may_anticipated",
      "rotten_tomatoes_premiere_calendar",
      "rotten_tomatoes_may_streaming",
      "flixpatrol_may_streaming",
      "toms_guide_weekly_streaming",
      "gamesradar_may29_weekend",
      "thewrap_may29_weekend",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "The clearest current-demand tentpole across audience anticipation, weekly picks, and a No. 1 JustWatch daily TV chart signal.",
  },
  "The Boys": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "prime_video_the_boys_series",
      "reelgood_us_streaming_charts_may28",
      "justwatch_us_tv_charts_may30",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Broad US demand from Reelgood and JustWatch, kept current with the Prime Video season page and a compact airing-now signal.",
  },
  FROM: {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "mgm_plus_from_series",
      "justwatch_from_may30",
      "toms_guide_weekly_streaming",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "MGM+ horror-mystery return with a fresh JustWatch daily TV top-10 signal and a compact season-four airing-now signal.",
  },
  "The Terror": {
    researchedAt: "2026-06-01",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "amc_the_terror_series",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "AMC+ anthology return added from the June 1 JustWatch daily TV top 10 with an official AMC series surface and compact June release signal.",
  },
  "M.I.A.": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "peacock_mia_series",
      "toms_guide_mia_watch",
    ],
    note: "Peacock's current May crime-drama drop gives the streaming-room mix a major missing destination with an official all-episodes-now signal.",
  },
  "Love Island USA": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "peacock_love_island_usa_s8",
      "nbcuniversal_love_island_usa_s8_press",
      "toms_guide_peacock_june",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Peacock's June 2 daily reality tentpole carries official schedule proof and current June-watchlist demand, preserving a high-volume unscripted lane for the homepage.",
  },
  "Star City": {
    researchedAt: "2026-05-29",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "apple_tv_star_city_press",
      "axios_may_streaming",
      "thewrap_may29_weekend",
      "gamesradar_may29_weekend",
      "rotten_tomatoes_may_streaming",
      "rotten_tomatoes_premiere_calendar",
      "justwatch_us_daily_streaming_charts_may31",
    ],
    note: "Officially dated Apple TV+ launch for May 29, reinforced by late-week streaming roundups and a JustWatch daily top-10 debut.",
  },
  "For All Mankind": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "apple_tv_for_all_mankind_s6_press",
      "tvline_for_all_mankind_s5_finale",
      "toms_guide_star_city_watch",
    ],
    note: "Apple TV+ season-five finale hit May 29 alongside Star City, keeping the original series in the live-demand set through finale and watch-guide context.",
  },
  "Cape Fear": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "apple_tv_cape_fear_press",
      "toms_guide_apple_tv_june",
      "gamesradar_2026_new_tv",
      "tvline_june_2026_calendar",
      "rotten_tomatoes_cape_fear",
    ],
    note: "Apple TV+'s June 5 Amy Adams/Javier Bardem thriller has official two-episode launch proof plus TVLine, Tom's Guide, GamesRadar, and Rotten Tomatoes watchlist validation.",
  },
  "Maximum Pleasure Guaranteed": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "apple_tv_maximum_pleasure_series",
      "rotten_tomatoes_maximum_pleasure_s1",
      "tvline_maximum_pleasure_review",
    ],
    note: "Current Apple TV+ dark-comedy thriller with same-week review attention and an official Apple streaming surface.",
  },
  "The Four Seasons": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_four_seasons_s2",
      "flixpatrol_us_streaming_may29",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
      "toms_guide_weekly_streaming",
      "gamesradar_may29_weekend",
      "thewrap_may29_weekend",
      "axios_may_streaming",
      "rotten_tomatoes_premiere_calendar",
    ],
    note: "Late-May weekly streaming pick with a JustWatch daily top-5 signal that gives the live-demand fallback a lighter comedy lane.",
  },
  "A Good Girl's Guide to Murder": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_good_girl_s2",
      "flixpatrol_us_streaming_may29",
      "toms_guide_weekly_streaming",
      "thewrap_may29_weekend",
    ],
    note: "Netflix-confirmed season 2 return with prior No. 1 global TV context and a current weekly streaming recommendation.",
  },
  "The Boroughs": {
    researchedAt: "2026-05-29",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_boroughs",
      "rotten_tomatoes_boroughs",
      "toms_guide_netflix_top10_may26",
      "reelgood_us_streaming_charts_may28",
      "flixpatrol_us_streaming_may29",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Netflix launch with credible sci-fi/horror texture, Rotten Tomatoes validation, and same-week Reelgood, Netflix, FlixPatrol, and JustWatch demand.",
  },
  "Man on Fire": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_man_on_fire",
      "toms_guide_netflix_top10_may26",
      "flixpatrol_us_streaming_may29",
    ],
    note: "Netflix action-thriller that remains in the same-week US top 10, filling a mainstream action lane without relying on unscripted chart noise.",
  },
  "Murder Mindfully": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_murder_mindfully_series",
      "justwatch_murder_mindfully_may30",
      "toms_guide_netflix_may25",
    ],
    note: "Netflix dark-comedy crime return with season-two availability, a JustWatch US daily-chart signal, and same-week streaming-guide coverage.",
  },
  Rafa: {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "about_netflix_rafa_may29",
      "netflix_rafa_series",
      "rotten_tomatoes_rafa",
      "flixpatrol_rafa_may29",
    ],
    note: "Netflix's May 29 Rafael Nadal sports docuseries adds a current documentary lane with official launch, Rotten Tomatoes, and FlixPatrol VOD-calendar support.",
  },
  "Sweet Magnolias": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_sweet_magnolias_s5",
      "toms_guide_netflix_june",
    ],
    note: "Netflix's June 11 comfort-drama return keeps a broad-audience scripted lane active after the May launch wave expires.",
  },
  "Avatar: The Last Airbender": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_avatar_last_airbender_s2",
      "toms_guide_netflix_june",
      "rotten_tomatoes_premiere_calendar",
    ],
    note: "Netflix's June 25 live-action franchise return keeps late-June family adventure demand alive with official date proof and independent June-watchlist validation.",
  },
  Elle: {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "about_amazon_elle_prime_video",
      "rotten_tomatoes_premiere_calendar",
    ],
    note: "Prime Video's July 1 Legally Blonde prequel extends the late-window current-demand mix with official trailer proof and premiere-calendar validation.",
  },
  "Deli Boys": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "hulu_deli_boys_s2",
      "justwatch_deli_boys_may28",
      "thewrap_may29_weekend",
      "axios_may_streaming",
      "toms_guide_hulu_may29_weekend",
      "rotten_tomatoes_premiere_calendar",
    ],
    note: "Hulu-confirmed season 2 return with same-day JustWatch US TV chart movement; included as a sharp comedy-crime texture pick.",
  },
  "The Testaments": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "hulu_testaments_guide",
      "rotten_tomatoes_testaments_s1",
      "justwatch_testaments_may30",
      "toms_guide_hulu_may29_weekend",
    ],
    note: "Hulu finale-week drama with official series availability, Rotten Tomatoes quality context, JustWatch demand, and same-weekend watchlist coverage.",
  },
  "The Beauty": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "disney_plus_the_beauty_fx",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
      "justwatch_the_beauty_may30",
    ],
    note:
      "FX/Hulu body-horror thriller moved into the JustWatch daily US TV top 10, with Disney+ watch-guide proof for the streaming window.",
  },
  "Not Suitable for Work": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "hulu_not_suitable_work_press",
      "toms_guide_hulu_june",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "June 2 Hulu workplace-comedy launch with an official three-episode premiere and current June watchlist demand.",
  },
  "The Bear": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "abc_the_bear_s5_watch",
      "toms_guide_hulu_june",
      "rotten_tomatoes_best_2025",
    ],
    note: "FX/Hulu final-season return with an official June 25 watch guide and same-month Hulu watchlist demand.",
  },
  "Lord of the Flies": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_lord_flies",
      "rotten_tomatoes_may_anticipated",
      "rotten_tomatoes_premiere_calendar",
    ],
    note: "Recent Netflix limited-series launch with anticipation and review context.",
  },
  Legends: {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_legends",
      "rotten_tomatoes_premiere_calendar",
      "flixpatrol_may_streaming",
    ],
    note: "Crime drama current enough for the fresh rail and different enough from US franchise picks.",
  },
  Nemesis: {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "netflix_tudum_nemesis",
      "flixpatrol_may_streaming",
      "flixpatrol_us_streaming_may29",
      "reelgood_us_streaming_charts_may28",
    ],
    note: "Action-crime entry included for demand breadth with Reelgood and FlixPatrol chart support, not as a generic prestige pick.",
  },
  Euphoria: {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "hbo_euphoria_series",
      "reelgood_us_streaming_charts_may28",
      "flixpatrol_us_streaming_may29",
      "justwatch_us_tv_charts_may30",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Broad US demand signals from Reelgood and JustWatch paired with HBO's official series page so the homepage is not only launch-week genre titles.",
  },
  "Your Friends & Neighbors": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "apple_tv_your_friends_neighbors_series",
      "rotten_tomatoes_premiere_calendar",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Apple TV+ crime drama with official season availability and premiere-calendar validation, strong enough for the broader live-demand fallback.",
  },
  "House of the Dragon": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "wbd_house_dragon_s3",
      "rotten_tomatoes_premiere_calendar",
      "toms_guide_hbo_max_june",
    ],
    note: "Officially dated June HBO tentpole return; included as a forward-looking current-demand pick rather than an old catalog title.",
  },
  "Rick and Morty": {
    researchedAt: "2026-05-28",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "wbd_rick_morty_s9",
      "rotten_tomatoes_premiere_calendar",
      "toms_guide_hbo_max_june",
      "tvline_may24_week",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Official Adult Swim season 9 premiere is already airing, with HBO Max availability tracked for streaming follow-through; strong catalog demand and short-session fit.",
  },
  "World War II with Tom Hanks": {
    researchedAt: "2026-06-01",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "history_world_war_ii_tom_hanks",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "HISTORY documentary event added from the refreshed June 1 JustWatch daily TV top 10 with an official series page and nonfiction coverage value.",
  },
  Condor: {
    researchedAt: "2026-06-01",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "mgmplus_condor_series",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Library thriller resurfacing in the June 1 JustWatch daily TV top 10, anchored by MGM+ availability and active chart demand.",
  },
  "The Madison": {
    researchedAt: "2026-06-01",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "paramount_press_the_madison",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Paramount+ Yellowstone-adjacent drama added from the June 1 JustWatch daily top 10 to keep the current-demand set aligned with live audience interest.",
  },
  "Dragon Striker": {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "disney_branded_dragon_striker",
      "toms_guide_disney_june",
    ],
    note: "New Disney+ animated sports-fantasy launch with all episodes streaming June 10 and an independent June watchlist top-pick signal.",
  },
  Pluribus: {
    researchedAt: "2026-06-01",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "apple_tv_pluribus_series",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Apple TV+ sci-fi drama added from the refreshed JustWatch daily TV top 10 with an official Apple TV series surface.",
  },
  Severance: {
    researchedAt: "2026-05-28",
    rationale: "quality_standout",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_best_2025"],
    note: "Prestige sci-fi anchor for viewers who want taste-forward essentials.",
  },
  Andor: {
    researchedAt: "2026-05-28",
    rationale: "quality_standout",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_best_2025"],
    note: "High-confidence franchise show with unusually strong critical signal.",
  },
  "Slow Horses": {
    researchedAt: "2026-05-28",
    rationale: "quality_standout",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_best_2025"],
    note: "Reliable prestige thriller for mature-drama taste clusters.",
  },
  Invincible: {
    researchedAt: "2026-06-01",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "prime_video_invincible_series",
      "rotten_tomatoes_invincible_s3",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Prime Video animated-action staple promoted from quality anchor to current-demand coverage after appearing in the refreshed June 1 JustWatch daily TV top 10.",
  },
  Hacks: {
    researchedAt: "2026-05-30",
    rationale: "current_demand",
    sourceIds: [
      "tmdb_live_catalog",
      "wbd_hacks_s5_finale",
      "rotten_tomatoes_best_2025",
      "toms_guide_weekly_streaming",
      "flixpatrol_us_streaming_may29",
      "justwatch_us_daily_streaming_charts_may31",
      "justwatch_us_daily_streaming_charts_jun1",
    ],
    note: "Finale-week HBO Max comedy pick with elite critical signal, compact episodes, and current JustWatch top-three plus weekly streaming demand.",
  },
  "Abbott Elementary": {
    researchedAt: "2026-05-28",
    rationale: "quick_watch",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_abbott_s5"],
    note: "Accessible network comedy that gives the short rail a warmer, lower-commitment lane.",
  },
  "Sofia the First: Royal Magic": {
    researchedAt: "2026-05-30",
    rationale: "premiere_calendar",
    sourceIds: [
      "tmdb_live_catalog",
      "disney_plus_sofia_royal_magic",
      "flixpatrol_us_streaming_may30",
    ],
    note: "Fresh Disney+ family animation premiere with a No. 1 Disney+ FlixPatrol chart signal, keeping provider rooms from becoming only adult prestige or franchise backlog.",
  },
  "Best of the World with Antoni Porowski": {
    researchedAt: "2026-05-29",
    rationale: "premiere_calendar",
    sourceIds: ["tmdb_live_catalog", "disney_plus_best_world_antoni"],
    note: "National Geographic travel docuseries launch that gives the Disney+ room a lifestyle/documentary lane.",
  },
  "The Simpsons": {
    researchedAt: "2026-05-29",
    rationale: "premiere_calendar",
    sourceIds: ["tmdb_live_catalog", "disney_plus_simpsons_summer"],
    note: "Current Disney+ summer episode drop; a recognizable comfort pick, not a niche discovery label.",
  },
  Overcompensating: {
    researchedAt: "2026-05-28",
    rationale: "quick_watch",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_best_2025"],
    note: "Recent campus comedy with enough critical signal to avoid filler.",
  },
  "The Rehearsal": {
    researchedAt: "2026-05-28",
    rationale: "quick_watch",
    sourceIds: ["tmdb_live_catalog", "rotten_tomatoes_best_2025"],
    note: "Singular comedy-doc pick for people who want something sharper than comfort sitcoms.",
  },
};

function toSeedTimestamp(value: Date | string | number) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  return Date.parse(value);
}

function getSeedDay(value: Date | string | number) {
  const timestamp = toSeedTimestamp(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / SEED_DAY_MS) : null;
}

function getEndOfDayTimestamp(value: string) {
  return Date.parse(`${value}T23:59:59.999Z`);
}

function getStartOfDayTimestamp(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function getStartOfUtcDayTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

function getIsoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getWindowBounds(window: HomeEditorialSeedWindow | undefined) {
  const validFrom = window?.validFrom
    ? getStartOfDayTimestamp(window.validFrom)
    : Number.NEGATIVE_INFINITY;
  const validThrough = window?.validThrough
    ? getEndOfDayTimestamp(window.validThrough)
    : Number.POSITIVE_INFINITY;
  const valid =
    (!window?.validFrom || Number.isFinite(validFrom)) &&
    (!window?.validThrough || Number.isFinite(validThrough));
  return { valid, validFrom, validThrough };
}

function isSeedTitleActive(
  title: string,
  now: Date | string | number,
) {
  const current = toSeedTimestamp(now);
  if (!Number.isFinite(current)) {
    return false;
  }
  const window = HOME_EDITORIAL_SEED_WINDOWS[title];
  if (!window) {
    return true;
  }
  const { valid, validFrom, validThrough } = getWindowBounds(window);
  if (!valid) {
    return false;
  }
  return current >= validFrom && current <= validThrough;
}

function hashSeedOrder(group: HomeEditorialSeedGroup, day: number) {
  const value = `${group}:${day}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotateSeedTitles(
  group: HomeEditorialSeedGroup,
  titles: string[],
  now: Date | string | number,
) {
  if (titles.length <= 1) return titles;
  const day = getSeedDay(now);
  if (day === null) return [];
  const offset = hashSeedOrder(group, day) % titles.length;
  return [...titles.slice(offset), ...titles.slice(0, offset)];
}

export function isHomeEditorialSeedGroupFresh(
  group: HomeEditorialSeedGroup,
  now: Date | string | number = new Date(),
) {
  const validThroughDate = HOME_EDITORIAL_SEED_VALID_THROUGH_DATES[group];
  const validThrough = getEndOfDayTimestamp(validThroughDate);
  const current = toSeedTimestamp(now);
  if (!Number.isFinite(validThrough) || !Number.isFinite(current)) {
    return false;
  }
  return current <= validThrough;
}

export function getHomeEditorialSeedTitles(
  group: HomeEditorialSeedGroup,
  now: Date | string | number = new Date(),
) {
  if (!isHomeEditorialSeedGroupFresh(group, now)) {
    return [];
  }
  return rotateSeedTitles(
    group,
    HOME_EDITORIAL_SEED_TITLES[group].filter((title) =>
      isSeedTitleActive(title, now),
    ),
    now,
  );
}

export function getHomeEditorialSeedProvenance(title: string) {
  const provenance = HOME_EDITORIAL_SEED_PROVENANCE[title];
  if (!provenance) return null;
  return { ...provenance, sourceIds: [...provenance.sourceIds] };
}

export function getHomeEditorialSeedItemByTitle(
  title: string | null | undefined,
  now: Date | string | number = new Date(),
) {
  const titleKey = title?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!titleKey) return null;
  const seedTitle = Object.keys(HOME_EDITORIAL_SEED_ITEMS).find(
    (candidate) => candidate.toLowerCase().replace(/\s+/g, " ") === titleKey,
  );
  if (!seedTitle || !isSeedTitleActive(seedTitle, now)) return null;

  const inFreshGroup = (Object.keys(HOME_EDITORIAL_SEED_TITLES) as HomeEditorialSeedGroup[]).some(
    (group) =>
      HOME_EDITORIAL_SEED_TITLES[group].includes(seedTitle) &&
      isHomeEditorialSeedGroupFresh(group, now),
  );
  if (!inFreshGroup) return null;

  const item = HOME_EDITORIAL_SEED_ITEMS[seedTitle];
  return item ? { ...item, genreIds: [...item.genreIds] } : null;
}

export function getHomeEditorialPlatformKeyByTitle(
  title: string | null | undefined,
  now: Date | string | number = new Date(),
) {
  const titleKey = title?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!titleKey) return null;
  const seedTitle = Object.keys(HOME_EDITORIAL_SEED_ITEMS).find(
    (candidate) => candidate.toLowerCase().replace(/\s+/g, " ") === titleKey,
  );
  if (!seedTitle || !isSeedTitleActive(seedTitle, now)) return null;
  const inFreshGroup = (Object.keys(HOME_EDITORIAL_SEED_TITLES) as HomeEditorialSeedGroup[]).some(
    (group) =>
      HOME_EDITORIAL_SEED_TITLES[group].includes(seedTitle) &&
      isHomeEditorialSeedGroupFresh(group, now),
  );
  if (!inFreshGroup) return null;

  return HOME_EDITORIAL_PLATFORM_BY_TITLE[seedTitle] ?? null;
}

export function getHomeEditorialSeedItems(
  group: HomeEditorialSeedGroup,
  now: Date | string | number = new Date(),
) {
  return getHomeEditorialSeedTitles(group, now).flatMap((title) => {
    const item = HOME_EDITORIAL_SEED_ITEMS[title];
    return item ? [{ ...item, genreIds: [...item.genreIds] }] : [];
  });
}

export function getHomeEditorialProviderSeedItems(
  providerKey: HomeEditorialProviderKey,
  now: Date | string | number = new Date(),
) {
  const activeTitles = new Set(
    (Object.keys(HOME_EDITORIAL_SEED_TITLES) as HomeEditorialSeedGroup[]).flatMap(
      (group) => getHomeEditorialSeedTitles(group, now),
    ),
  );

  return HOME_EDITORIAL_PROVIDER_SEED_TITLES[providerKey].flatMap((title) => {
    if (!activeTitles.has(title)) return [];
    const item = HOME_EDITORIAL_SEED_ITEMS[title];
    return item ? [{ ...item, genreIds: [...item.genreIds] }] : [];
  });
}

export function getHomeEditorialSeedEntries(
  group: HomeEditorialSeedGroup,
  now: Date | string | number = new Date(),
) {
  return getHomeEditorialSeedTitles(group, now).flatMap((title) => {
    const item = HOME_EDITORIAL_SEED_ITEMS[title];
    const provenance = getHomeEditorialSeedProvenance(title);
    return item && provenance
      ? [{ title, item: { ...item, genreIds: [...item.genreIds] }, provenance }]
      : [];
  });
}

export function getHomeEditorialSeedItemsByRationale(
  group: HomeEditorialSeedGroup,
  rationale: HomeEditorialSeedRationale,
  now: Date | string | number = new Date(),
) {
  return getHomeEditorialSeedEntries(group, now)
    .filter((entry) => entry.provenance.rationale === rationale)
    .map((entry) => entry.item);
}

export function getHomeEditorialDailyChartRank(title: string | null | undefined) {
  const titleKey = title?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!titleKey) return null;
  return HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_RANK_BY_TITLE.get(titleKey) ?? null;
}

function getHomeEditorialChartPositionBoost(title: string) {
  const dailyRank = getHomeEditorialDailyChartRank(title);
  if (dailyRank !== null) {
    return Math.max(
      0,
      HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_BOOST_BASE -
        dailyRank * HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_RANK_STEP,
    );
  }
  return HOME_EDITORIAL_CHART_POSITION_BOOST_BY_TITLE[title] ?? 0;
}

export function getHomeEditorialDemandConfidenceScore(title: string) {
  const provenance = HOME_EDITORIAL_SEED_PROVENANCE[title];
  const item = HOME_EDITORIAL_SEED_ITEMS[title];
  if (!provenance || !item) return 0;

  const demandSourceIds = new Set(HOME_EDITORIAL_DEMAND_SOURCE_IDS);
  const sourceScore = provenance.sourceIds.reduce((total, sourceId) => {
    if (HOME_EDITORIAL_DEMAND_SOURCE_WEIGHTS[sourceId]) {
      return total + HOME_EDITORIAL_DEMAND_SOURCE_WEIGHTS[sourceId];
    }
    return total + (demandSourceIds.has(sourceId) ? 6 : 0);
  }, 0);
  const officialSourceId = HOME_EDITORIAL_OFFICIAL_SOURCE_BY_TITLE[title];
  const officialScore =
    officialSourceId && provenance.sourceIds.includes(officialSourceId) ? 10 : 0;
  const currentScore = provenance.rationale === "current_demand" ? 24 : 0;
  const signalScore =
    item.editorialTier === "verified_current" && item.homeSignal?.trim() ? 12 : 0;
  const chartPositionScore = getHomeEditorialChartPositionBoost(title);

  return sourceScore + officialScore + currentScore + signalScore + chartPositionScore;
}

export function getHomeEditorialSeedEntriesByRationale(
  rationale: HomeEditorialSeedRationale,
  now: Date | string | number = new Date(),
) {
  const entriesByTitle = new Map<string, ReturnType<typeof getHomeEditorialSeedEntries>[number]>();

  (Object.keys(HOME_EDITORIAL_SEED_TITLES) as HomeEditorialSeedGroup[]).forEach((group) => {
    getHomeEditorialSeedEntries(group, now).forEach((entry) => {
      if (entry.provenance.rationale !== rationale) return;
      if (!entriesByTitle.has(entry.title)) {
        entriesByTitle.set(entry.title, entry);
      }
    });
  });

  return [...entriesByTitle.values()].sort((left, right) => {
    const confidenceDelta =
      getHomeEditorialDemandConfidenceScore(right.title) -
      getHomeEditorialDemandConfidenceScore(left.title);
    if (confidenceDelta !== 0) return confidenceDelta;
    return left.title.localeCompare(right.title);
  });
}

export function getHomeEditorialCurrentDemandSeedItems(
  now: Date | string | number = new Date(),
) {
  return getHomeEditorialSeedEntriesByRationale("current_demand", now).map(
    (entry) => entry.item,
  );
}

function getCurrentDemandCoverageFindings(
  activeCurrentDemandTitles: Map<string, HomeEditorialSeedItem>,
) {
  const platformCounts = new Map<HomeEditorialPlatformKey, number>();
  const primaryGenreIds = new Set<number>();
  let nonfictionCount = 0;

  activeCurrentDemandTitles.forEach((item, title) => {
    const platform = HOME_EDITORIAL_PLATFORM_BY_TITLE[title];
    if (platform) {
      platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
    }
    if (item.genreIds.some((genreId) => NONFICTION_TV_GENRE_IDS.has(genreId))) {
      nonfictionCount += 1;
    }
    const primaryGenreId = item.genreIds[0];
    if (typeof primaryGenreId === "number") {
      primaryGenreIds.add(primaryGenreId);
    }
  });

  const findings: HomeEditorialSeedAuditFinding[] = [];
  if (activeCurrentDemandTitles.size < MIN_ACTIVE_CURRENT_DEMAND_ITEMS) {
    findings.push({
      issue: "current_demand_too_few_active_titles",
      detail: `Active current-demand seeds include ${activeCurrentDemandTitles.size} title(s); expected at least ${MIN_ACTIVE_CURRENT_DEMAND_ITEMS}`,
    });
  }
  if (
    activeCurrentDemandTitles.size > 0 &&
    platformCounts.size < MIN_ACTIVE_CURRENT_DEMAND_PLATFORMS
  ) {
    findings.push({
      issue: "current_demand_too_few_platforms",
      detail: `Active current-demand seeds cover ${platformCounts.size} platform(s); expected at least ${MIN_ACTIVE_CURRENT_DEMAND_PLATFORMS}`,
    });
  }
  if (
    activeCurrentDemandTitles.size > 0 &&
    primaryGenreIds.size < MIN_ACTIVE_CURRENT_DEMAND_PRIMARY_GENRES
  ) {
    findings.push({
      issue: "current_demand_too_few_genres",
      detail: `Active current-demand seeds cover ${primaryGenreIds.size} primary genre(s); expected at least ${MIN_ACTIVE_CURRENT_DEMAND_PRIMARY_GENRES}`,
    });
  }
  if (
    activeCurrentDemandTitles.size > 0 &&
    nonfictionCount < MIN_ACTIVE_CURRENT_DEMAND_NONFICTION_ITEMS
  ) {
    findings.push({
      issue: "current_demand_missing_nonfiction_lane",
      detail:
        "Active current-demand seeds should include at least one documentary, reality, news, or talk lane",
    });
  }
  platformCounts.forEach((count, platform) => {
    const share = activeCurrentDemandTitles.size > 0
      ? count / activeCurrentDemandTitles.size
      : 0;
    if (share <= MAX_ACTIVE_CURRENT_DEMAND_PLATFORM_SHARE) return;
    findings.push({
      issue: "current_demand_platform_overrepresented",
      sourceId: platform,
      detail: `${platform} accounts for ${count} of ${activeCurrentDemandTitles.size} active current-demand seeds`,
    });
  });

  return {
    platformCount: platformCounts.size,
    primaryGenreCount: primaryGenreIds.size,
    nonfictionCount,
    findings,
  };
}

function getActiveCurrentDemandTitlesAt(now: number) {
  const activeCurrentDemandTitles = new Map<string, HomeEditorialSeedItem>();

  (Object.keys(HOME_EDITORIAL_SEED_TITLES) as HomeEditorialSeedGroup[]).forEach(
    (group) => {
      HOME_EDITORIAL_SEED_TITLES[group].forEach((title) => {
        const item = HOME_EDITORIAL_SEED_ITEMS[title];
        const provenance = HOME_EDITORIAL_SEED_PROVENANCE[title];
        if (!item || provenance?.rationale !== "current_demand") return;
        if (!isSeedTitleActive(title, now)) return;
        activeCurrentDemandTitles.set(title, item);
      });
    },
  );

  return activeCurrentDemandTitles;
}

function getCurrentDemandTitlesDroppingOutAt(
  now: number,
  previousDayTitles: Map<string, HomeEditorialSeedItem>,
) {
  const activeTitles = getActiveCurrentDemandTitlesAt(now);
  return [...previousDayTitles.keys()].filter(
    (title) => !activeTitles.has(title),
  );
}

function getExpiringTitlesDetail(titles: string[]) {
  if (titles.length === 0) return "";

  const previewTitles = titles.slice(0, 5);
  const remainingCount = titles.length - previewTitles.length;
  const suffix =
    remainingCount > 0 ? `, plus ${remainingCount} more` : "";
  return ` Titles dropping out before then: ${previewTitles.join(", ")}${suffix}.`;
}

function getDailyChartCoverageFindings(
  now: number,
  activeCurrentDemandTitles: Map<string, HomeEditorialSeedItem>,
) {
  const findings: HomeEditorialSeedAuditFinding[] = [];
  const checkedAt = getStartOfUtcDayTimestamp(
    getStartOfDayTimestamp(HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.checkedAt),
  );
  const currentDay = getStartOfUtcDayTimestamp(now);
  if (!Number.isFinite(checkedAt) || !Number.isFinite(currentDay)) {
    findings.push({
      issue: "daily_chart_snapshot_stale",
      sourceId: HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.sourceId,
      detail: "Current-demand daily chart snapshot has an invalid checkedAt date",
    });
    return findings;
  }

  const chartAgeDays = Math.floor((currentDay - checkedAt) / SEED_DAY_MS);
  if (chartAgeDays > HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.maxAgeDays) {
    findings.push({
      issue: "daily_chart_snapshot_stale",
      sourceId: HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.sourceId,
      detail: `JustWatch daily chart snapshot is ${chartAgeDays} days old; refresh within ${HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.maxAgeDays} day(s)`,
    });
    return findings;
  }

  getHomeEditorialAcceptedDailyChartTitles().forEach((title) => {
    if (!activeCurrentDemandTitles.has(title)) {
      findings.push({
        issue: "daily_chart_title_missing_seed",
        title,
        sourceId: HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.sourceId,
        detail: "Current JustWatch daily top-10 title must be active in current-demand seeds",
      });
      return;
    }
    if (
      !HOME_EDITORIAL_SEED_PROVENANCE[title]?.sourceIds.includes(
        HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.sourceId,
      )
    ) {
      findings.push({
        issue: "daily_chart_title_missing_source",
        title,
        sourceId: HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.sourceId,
        detail: "Current JustWatch daily top-10 title must cite the chart snapshot source",
      });
    }
  });

  return findings;
}

function getDailyChartRefreshWarnings(
  now: number,
  chartFindings: HomeEditorialSeedAuditFinding[],
): HomeEditorialSeedAuditWarning[] {
  if (!Number.isFinite(now) || chartFindings.length > 0) {
    return [];
  }

  const checkedAt = getStartOfUtcDayTimestamp(
    getStartOfDayTimestamp(HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.checkedAt),
  );
  const currentDay = getStartOfUtcDayTimestamp(now);
  if (!Number.isFinite(checkedAt) || !Number.isFinite(currentDay)) {
    return [];
  }

  const staleAt =
    checkedAt +
    (HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.maxAgeDays + 1) * SEED_DAY_MS;
  const daysUntilStale = Math.floor((staleAt - currentDay) / SEED_DAY_MS);
  if (
    daysUntilStale < 0 ||
    daysUntilStale > DAILY_CHART_REFRESH_WARNING_DAYS
  ) {
    return [];
  }

  return [
    {
      issue: "daily_chart_snapshot_expires_soon",
      effectiveAt: getIsoDate(staleAt),
      daysUntil: daysUntilStale,
      expiringTitles: [...HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.titles],
      findings: [
        {
          issue: "daily_chart_snapshot_stale",
          sourceId: HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.sourceId,
          detail:
            "Current JustWatch daily chart snapshot will exceed its freshness window",
        },
      ],
      detail: `Refresh ${HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.sourceId} by ${getIsoDate(staleAt)} so current-demand ranking does not go stale. Affected daily-chart titles: ${HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART.titles.join(", ")}.`,
    },
  ];
}

function getCurrentDemandCoverageWarnings(
  now: number,
  currentFindings: HomeEditorialSeedAuditFinding[],
): HomeEditorialSeedAuditWarning[] {
  if (!Number.isFinite(now) || currentFindings.length > 0) {
    return [];
  }

  const startOfToday = getStartOfUtcDayTimestamp(now);
  for (
    let dayOffset = 1;
    dayOffset <= CURRENT_DEMAND_COVERAGE_LOOKAHEAD_DAYS;
    dayOffset += 1
  ) {
    const forecastAt = startOfToday + dayOffset * SEED_DAY_MS;
    const forecastTitles = getActiveCurrentDemandTitlesAt(forecastAt);
    const forecastCoverage = getCurrentDemandCoverageFindings(forecastTitles);
    if (forecastCoverage.findings.length === 0) {
      continue;
    }

    const previousDayTitles = getActiveCurrentDemandTitlesAt(
      forecastAt - SEED_DAY_MS,
    );
    const expiringTitles = getCurrentDemandTitlesDroppingOutAt(
      forecastAt,
      previousDayTitles,
    );
    const expiringDetail = getExpiringTitlesDetail(expiringTitles);
    const effectiveAt = getIsoDate(forecastAt);
    const issueList = forecastCoverage.findings
      .map((finding) => finding.issue)
      .join(", ");
    return [
      {
        issue: "current_demand_coverage_expires_soon",
        effectiveAt,
        daysUntil: dayOffset,
        expiringTitles,
        findings: forecastCoverage.findings,
        detail: `Current-demand editorial coverage is projected to miss ${issueList} on ${effectiveAt}; refresh researched homepage seeds before then.${expiringDetail}`,
      },
    ];
  }

  return [];
}

export function auditHomeEditorialSeeds(
  now: Date | string | number = new Date(),
): HomeEditorialSeedAuditReport {
  const current = toSeedTimestamp(now);
  const currentYear = Number.isFinite(current)
    ? new Date(current).getUTCFullYear()
    : new Date().getUTCFullYear();
  const knownSourceIds = new Set(Object.keys(HOME_EDITORIAL_RESEARCH_SOURCES));
  const demandSourceIds = new Set(HOME_EDITORIAL_DEMAND_SOURCE_IDS);
  const findings: HomeEditorialSeedAuditFinding[] = [];
  const activeCurrentDemandTitles = new Map<string, HomeEditorialSeedItem>();
  let activeTitleCount = 0;
  let activeCurrentDemandCount = 0;

  const addFinding = (finding: HomeEditorialSeedAuditFinding) => {
    findings.push(finding);
  };

  (Object.keys(HOME_EDITORIAL_SEED_VALID_THROUGH_DATES) as HomeEditorialSeedGroup[]).forEach(
    (group) => {
      const validThroughDate = HOME_EDITORIAL_SEED_VALID_THROUGH_DATES[group];
      const validThrough = getEndOfDayTimestamp(validThroughDate);
      if (!Number.isFinite(validThrough)) {
        addFinding({
          issue: "invalid_group_window",
          group,
          detail: `Invalid review date ${validThroughDate}`,
        });
      } else if (Number.isFinite(current) && current > validThrough) {
        addFinding({
          issue: "group_window_expired",
          group,
          detail: `Review expired ${validThroughDate}`,
        });
      }

      HOME_EDITORIAL_SEED_TITLES[group].forEach((title) => {
        const item = HOME_EDITORIAL_SEED_ITEMS[title];
        const provenance = HOME_EDITORIAL_SEED_PROVENANCE[title];
        const window = HOME_EDITORIAL_SEED_WINDOWS[title];
        const active = Number.isFinite(current) ? isSeedTitleActive(title, current) : false;

        if (!item) {
          addFinding({ issue: "missing_item", group, title });
          return;
        }
        if (!item.posterUrl || !item.backdropUrl || !item.externalId) {
          addFinding({ issue: "missing_artwork", group, title });
        }
        if (!provenance) {
          addFinding({ issue: "missing_provenance", group, title });
          return;
        }

        if (item.homeSignal?.trim() && !window) {
          addFinding({
            issue: "signal_missing_title_window",
            group,
            title,
            detail: "Visible home signals need title-level freshness windows",
          });
        }

        if (active) {
          activeTitleCount += 1;
        }

        if (provenance.sourceIds.length < 2) {
          addFinding({
            issue: "under_sourced",
            group,
            title,
            detail: "Editorial seed should have at least two independent source IDs",
          });
        }
        provenance.sourceIds.forEach((sourceId) => {
          if (!knownSourceIds.has(sourceId)) {
            addFinding({ issue: "unknown_source", group, title, sourceId });
          }
        });

        if (window) {
          const { valid, validFrom, validThrough: titleValidThrough } = getWindowBounds(window);
          if (!valid || validFrom > titleValidThrough) {
            addFinding({ issue: "invalid_title_window", group, title });
          } else if (
            Number.isFinite(validThrough) &&
            Number.isFinite(titleValidThrough) &&
            titleValidThrough > validThrough
          ) {
            addFinding({
              issue: "invalid_title_window",
              group,
              title,
              detail: "Title window cannot exceed its group review date",
            });
          }
        }

        if (item.editorialTier === "verified_current") {
          const officialSourceId = HOME_EDITORIAL_OFFICIAL_SOURCE_BY_TITLE[title];
          if (!item.homeSignal?.trim()) {
            addFinding({
              issue: "verified_current_missing_signal",
              group,
              title,
              detail: "Verified current picks need a compact release or chart signal",
            });
          }
          if (!officialSourceId || !provenance.sourceIds.includes(officialSourceId)) {
            addFinding({
              issue: "verified_current_missing_official_source",
              group,
              title,
              sourceId: officialSourceId,
              detail: "Verified current picks need an official source in provenance",
            });
          }
        }

        if (provenance.rationale !== "current_demand") {
          return;
        }

        if (active) {
          activeCurrentDemandCount += 1;
          activeCurrentDemandTitles.set(title, item);
        }
        const officialSourceId = HOME_EDITORIAL_OFFICIAL_SOURCE_BY_TITLE[title];
        if (!window?.validThrough) {
          addFinding({
            issue: "current_demand_missing_title_window",
            group,
            title,
          });
        }
        if (!officialSourceId || !provenance.sourceIds.includes(officialSourceId)) {
          addFinding({
            issue: "current_demand_missing_official_source",
            group,
            title,
            sourceId: officialSourceId,
            detail: "Every current-demand seed needs an official platform or network source",
          });
        }
        if (!provenance.sourceIds.some((sourceId) => demandSourceIds.has(sourceId))) {
          addFinding({
            issue: "current_demand_missing_demand_source",
            group,
            title,
            detail:
              "Every current-demand seed needs at least one audience chart, critic/editorial watchlist, calendar, or launch-performance source beyond official availability",
          });
        }
        if (item.year < currentYear - 1 && !item.homeSignal?.trim()) {
          addFinding({
            issue: "old_current_demand_missing_signal",
            group,
            title,
            detail: "Older current-demand shows need a visible return-season signal",
          });
        }
        if (Number.isFinite(current)) {
          const researchedAt = getStartOfDayTimestamp(provenance.researchedAt);
          const researchAgeDays = Number.isFinite(researchedAt)
            ? Math.floor((current - researchedAt) / SEED_DAY_MS)
            : Number.POSITIVE_INFINITY;
          if (researchAgeDays > 45) {
            addFinding({
              issue: "current_demand_research_stale",
              group,
              title,
              detail: `Current-demand research is ${researchAgeDays} days old`,
            });
          }
        }
      });
    },
  );

  const currentDemandCoverage =
    getCurrentDemandCoverageFindings(activeCurrentDemandTitles);
  currentDemandCoverage.findings.forEach(addFinding);
  const dailyChartFindings = getDailyChartCoverageFindings(
    current,
    activeCurrentDemandTitles,
  );
  dailyChartFindings.forEach(addFinding);
  const warnings = [
    ...getDailyChartRefreshWarnings(current, dailyChartFindings),
    ...getCurrentDemandCoverageWarnings(
      current,
      currentDemandCoverage.findings,
    ),
  ];

  return {
    healthy: findings.length === 0,
    checkedAt: Number.isFinite(current) ? current : Date.now(),
    activeTitleCount,
    activeCurrentDemandCount,
    activeCurrentDemandPlatformCount: currentDemandCoverage.platformCount,
    activeCurrentDemandPrimaryGenreCount: currentDemandCoverage.primaryGenreCount,
    activeCurrentDemandNonfictionCount: currentDemandCoverage.nonfictionCount,
    warnings,
    findings,
  };
}
