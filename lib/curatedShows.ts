// Curated marquee artwork (poster + widescreen backdrop) shared by the
// sign-in poster wall and the web landing page.
export const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w342";
export const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";

const TMDB_P = TMDB_POSTER_BASE;
const TMDB_B = TMDB_BACKDROP_BASE;

export type CuratedShow = {
  id: string;
  t: string;
  p: string;
  b: string;
};

export const CURATED_SHOWS: CuratedShow[] = [
  { id: "bb", t: "Breaking Bad", p: `${TMDB_P}/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg`, b: `${TMDB_B}/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg` },
  { id: "sev", t: "Severance", p: `${TMDB_P}/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg`, b: `${TMDB_B}/ixgFmf1X59PUZam2qbAfskx2gQr.jpg` },
  { id: "plur", t: "Pluribus", p: `${TMDB_P}/z7Nga7Q9IGFWs5OEduY2gGFxnX3.jpg`, b: `${TMDB_B}/ulm1ex4JFYJByyaPyqTr47MFyEQ.jpg` },
  { id: "and", t: "Andor", p: `${TMDB_P}/khZqmwHQicTYoS7Flreb9EddFZC.jpg`, b: `${TMDB_B}/kCGwvjpqM1owt9kI4pkYPJWJLvc.jpg` },
  { id: "succ", t: "Succession", p: `${TMDB_P}/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg`, b: `${TMDB_B}/bcdUYUFk8GdpZJPiSAas9UeocLH.jpg` },
  { id: "bear", t: "The Bear", p: `${TMDB_P}/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg`, b: `${TMDB_B}/wHNwlE6ftEpgjVbdhLXOtv1hLs0.jpg` },
  { id: "st", t: "Stranger Things", p: `${TMDB_P}/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg`, b: `${TMDB_B}/8zbAoryWbtH0DKdev8abFAjdufy.jpg` },
  { id: "got", t: "Game of Thrones", p: `${TMDB_P}/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg`, b: `${TMDB_B}/zZqpAXxVSBtxV9qPBcscfXBcL2w.jpg` },
  { id: "bcs", t: "Better Call Saul", p: `${TMDB_P}/fC2HDm5t0kHl7mTm7jxMR31b7by.jpg`, b: `${TMDB_B}/t15KHp3iNfHVQBNIaqUGW12xQA4.jpg` },
  { id: "tlou", t: "The Last of Us", p: `${TMDB_P}/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg`, b: `${TMDB_B}/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg` },
  { id: "sho", t: "Shōgun", p: `${TMDB_P}/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg`, b: `${TMDB_B}/bwSmgmd90hCWwqOKQYTEraeOZhJ.jpg` },
  { id: "arc", t: "Arcane", p: `${TMDB_P}/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg`, b: `${TMDB_B}/q8eejQcg1bAqImEV8jh8RtBD4uH.jpg` },
  { id: "sop", t: "The Sopranos", p: `${TMDB_P}/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg`, b: `${TMDB_B}/lNpkvX2s8LGB0mjGODMT4o6Up7j.jpg` },
  { id: "td", t: "True Detective", p: `${TMDB_P}/cuV2O5ZyDLHSOWzg3nLVljp1ubw.jpg`, b: `${TMDB_B}/bPLRjO2pcBx0WL73WUPzuNzQ3YN.jpg` },
  { id: "pb", t: "Peaky Blinders", p: `${TMDB_P}/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg`, b: `${TMDB_B}/dzq83RHwQcnP6WGJ6YkenIqeaa5.jpg` },
  { id: "euph", t: "Euphoria", p: `${TMDB_P}/3Q0hd3heuWwDWpwcDkhQOA6TYWI.jpg`, b: `${TMDB_B}/9KnIzPCv9XpWA0MqmwiKBZvV1Sj.jpg` },
  { id: "sg", t: "Squid Game", p: `${TMDB_P}/1QdXdRYfktUSONkl1oD5gc6Be0s.jpg`, b: `${TMDB_B}/2meX1nMdScFOoV4370rqHWKmXhY.jpg` },
  { id: "wire", t: "The Wire", p: `${TMDB_P}/4lbclFySvugI51fwsyxBTOm4DqK.jpg`, b: `${TMDB_B}/layPSOJGckJv3PXZDIVluMq69mn.jpg` },
  { id: "loki", t: "Loki", p: `${TMDB_P}/kEl2t3OhXc3Zb9FBh1AuYzRTgZp.jpg`, b: `${TMDB_B}/N1hWzVPpZ8lIQvQskgdQogxdsc.jpg` },
];
