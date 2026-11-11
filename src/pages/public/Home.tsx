import { AdPopup } from "../../components/banners";
import { HomeSections } from "../../components/home/Sections";
import { useSiteSettings } from "../../lib/content";
import { homeSections } from "../../lib/homeSections";

/** Public home page: a list of blocks that Admin arranges in "เนื้อหาหน้าเว็บ → หน้าแรก". */
export default function Home() {
  const s = useSiteSettings();
  return (
    <>
      <HomeSections sections={homeSections(s)} />
      <AdPopup />
    </>
  );
}
