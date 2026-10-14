import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { getPreferences } from "../../lib/preferences/preferences";
import { hasAdultAccess } from "../../lib/security/adultPin";
import { getChapter, getSeries } from "../../lib/storage/db";
import { AdultAccessPrompt } from "./AdultAccessPrompt";

const ADULT_RATING = /(18\+?|adult|mature|r-?18|nc-?17)/i;

export function AdultContentGate({ children }: { children: ReactNode }) {
  const { id, chapterId } = useParams();
  const [isChecking, setIsChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      let seriesId = id;
      if (chapterId) {
        seriesId = (await getChapter(decodeURIComponent(chapterId)))?.seriesId;
      }
      const series = seriesId ? await getSeries(seriesId) : undefined;
      if (isCancelled) return;

      if (!series || !ADULT_RATING.test(series.ageRating ?? "")) {
        setIsAllowed(true);
      } else {
        setIsAllowed(hasAdultAccess(getPreferences().adultPinHash));
      }
      setIsChecking(false);
    })().catch(() => {
      if (!isCancelled) {
        setIsAllowed(false);
        setIsChecking(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [chapterId, id]);

  if (isChecking) {
    return <main aria-busy="true" style={{ minHeight: "100dvh" }} />;
  }
  if (!isAllowed) {
    return <AdultAccessPrompt onUnlocked={() => setIsAllowed(true)} />;
  }
  return children;
}
