import { SectionHeading, TeamCard } from "../../components/cards";
import { Empty, Loading } from "../../components/ui";
import { usePublishedTeam } from "../../lib/content";
import { DEPARTMENT_LABEL } from "../../lib/types";

export default function Team() {
  const { rows, loading } = usePublishedTeam();
  const groups = ["sales", "service", "coordination", "management", "other"]
    .map((d) => ({ d, members: rows.filter((m) => m.department === d) }))
    .filter((g) => g.members.length);
  return (
    <div className="container-x py-16">
      <SectionHeading eyebrow="ทีมงาน" title="ติดต่อพนักงาน" subtitle="เลือกติดต่อทีมที่ตรงกับเรื่องของคุณได้โดยตรง" />
      {loading ? (
        <Loading />
      ) : groups.length ? (
        <div className="space-y-10">
          {groups.map(({ d, members }) => (
            <div key={d}>
              <h3 className="mb-4 font-semibold text-navy-800">{DEPARTMENT_LABEL[d]}</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{members.map((m) => <TeamCard key={m.id} m={m} />)}</div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>ยังไม่มีรายชื่อทีมงาน</Empty>
      )}
    </div>
  );
}
