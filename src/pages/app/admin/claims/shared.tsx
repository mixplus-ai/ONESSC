import { createContext, useContext } from "react";
import type { BoardStatus, Claim, ClaimUnit } from "../../../../lib/claims";

export interface StaffOpt { id: string; full_name: string | null; email: string; role: string }
export interface BrandOpt { id: string; name: string; slug: string }

export interface BoardData {
  claims: Claim[];
  units: ClaimUnit[];
  unitsBy: Map<string, ClaimUnit[]>;
  statusBy: Map<string, BoardStatus>;
  staff: StaffOpt[];
  brands: BrandOpt[];
  canEdit: boolean; // perm 'claims'
  reload: () => Promise<void>;
  loadedAt: Date | null;
}
export const BoardCtx = createContext<BoardData | null>(null);
export function useBoard() {
  const b = useContext(BoardCtx);
  if (!b) throw new Error("useBoard outside ClaimsAdmin");
  return b;
}
export const staffName = (staff: StaffOpt[], id: string | null) => {
  if (!id) return "ยังไม่มีผู้รับผิดชอบ";
  const s = staff.find((x) => x.id === id);
  return s ? s.full_name || s.email : "เจ้าหน้าที่";
};
