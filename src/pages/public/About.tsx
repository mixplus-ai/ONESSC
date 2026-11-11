import { HomeSections } from "../../components/home/Sections";
import { useSiteSettings } from "../../lib/content";
import { aboutSections } from "../../lib/homeSections";

/** Public About page: blocks that Admin arranges in "เนื้อหาหน้าเว็บ → หน้าเกี่ยวกับเรา". */
export default function About() {
  const s = useSiteSettings();
  return <HomeSections sections={aboutSections(s)} />;
}
