import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Loading, Select, cx } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { formatDate, formatDateTime } from "../../../../lib/catalog";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import {
  CONDITION_LABEL, DIR, DOC_LABEL, DOC_STATUS_LABEL, DOC_STATUS_TONE, DOC_TYPES, PARTNER_LABEL, REF_LABEL, SERIAL_STATUS_LABEL,
  snKey, splitSns, type Condition, type DocItem, type DocType, type Serial, type StockDoc, type Warehouse,
} from "../../../../lib/stockdocs";
import { DocFiles, uploadDocFiles } from "./DocFiles";
import { CameraScan } from "./CameraScan";
import { PhotoScan } from "./PhotoScan";
import { printStockDoc } from "./print";

interface StockRow { sku: string; description: string | null }
interface CompanyOpt { id: string; name: string; tax_id: string }
type Head = Partial<StockDoc> & { doc_type: DocType };

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

interface DeliveryRef { id: string; doc_no: string | null; delivery_date: string; customer_name: string; customer_tax_id: string | null; company_id: string | null; site: string | null; warehouse: string | null; delivery_items: { model: string; description: string | null; qty: number }[] }

interface ClaimRef { id: string; claim_no: string; company_id: string | null; company_name: string | null; contact_name: string | null; site_name: string | null; reported_sns: string[] }
interface ReservationRef { id: string; code: string; company_id: string | null; companies: { name: string; tax_id: string } | null; profiles: { full_name: string | null; email: string } | null; reservation_items: { sku: string; label: string; qty: number }[] }

// add lines, skipping SNs already in the list (fast camera scans can arrive before the list re-renders)
const uniq = (list: DocItem[], add: DocItem[]) => {
  const k = new Set(list.map((i) => snKey(i.sn)));
  return [...list, ...add.filter((i) => !k.has(snKey(i.sn)) && k.add(snKey(i.sn)))];
};

export function DocEditor({ id, type, warehouses, deliveryId, claimId, reservationId, onClose, onChanged }: {
  id: string | null; type: DocType; warehouses: Warehouse[]; deliveryId?: string | null; claimId?: string | null; reservationId?: string | null;
  onClose: () => void; onChanged: (id: string) => void;
}) {
  const { can, isAdmin, profile } = useAuth();
  const canPost = can("stock.post");
  const canSave = can("stock.docs") || can("stock.post");
  const canCheck = can("stock.check") || can("stock.post");
  const cfg = useRows<{ check_types: DocType[] }>(() => supabase.from("stock_config").select("check_types").eq("id", 1));
  const [head, setHead] = useState<Head>({ doc_type: type, doc_date: today(), warehouse_id: warehouses[0]?.id });
  const [items, setItems] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [sku, setSku] = useState("");
  const [cond, setCond] = useState<Condition>("good");
  const [scan, setScan] = useState("");
  const [warn, setWarn] = useState<string[]>([]);
  const scanRef = useRef<HTMLTextAreaElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileTick, setFileTick] = useState(0);

  const t = head.doc_type;
  const dir = DIR[t];
  const locked = !!head.status && head.status !== "draft";
  const stock = useRows<StockRow>(() => supabase.from("stock_levels").select("sku, description").order("sku"));
  const companies = useRows<CompanyOpt>(() => supabase.from("companies").select("id, name, tax_id").order("name"));
  const outDocs = useRows<StockDoc>(
    () => t === "RT" ? supabase.from("stock_docs").select("*").in("doc_type", ["SO", "BR", "WD"]).eq("status", "posted").order("doc_date", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    [t],
  );
  const skuName = useMemo(() => new Map(stock.rows.map((r) => [r.sku, r.description])), [stock.rows]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [d, it] = await Promise.all([
        supabase.from("stock_docs").select("*").eq("id", id).single(),
        supabase.from("stock_doc_items").select("*").eq("doc_id", id).order("sort"),
      ]);
      if (d.error) setErr(errorMessage(d.error));
      else setHead(d.data as StockDoc);
      setItems((it.data ?? []) as DocItem[]);
      setLoading(false);
    })();
  }, [id]);

  // started from a delivery (ตารางส่งสินค้า): fill the header and show what the delivery note lists
  const [delivery, setDelivery] = useState<DeliveryRef | null>(null);
  useEffect(() => {
    const did = deliveryId ?? (head.delivery_id || null);
    if (!did || delivery?.id === did) return;
    supabase.from("deliveries").select("id, doc_no, delivery_date, customer_name, customer_tax_id, company_id, site, warehouse, delivery_items(model, description, qty)").eq("id", did).single()
      .then(({ data }) => {
        if (!data) return;
        const d = data as DeliveryRef;
        setDelivery(d);
        if (id) return;
        const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const w = d.warehouse ? warehouses.find((x) => norm(d.warehouse!).includes(norm(x.code)) || norm(x.name).includes(norm(d.warehouse!))) : undefined;
        setHead((h) => ({
          ...h, delivery_id: d.id, partner_name: d.customer_name, partner_tax_id: d.customer_tax_id, company_id: d.company_id,
          ref_no: d.doc_no, site_name: d.site, doc_date: d.delivery_date || h.doc_date, ...(w ? { warehouse_id: w.id } : {}),
        }));
      });
  }, [deliveryId, head.delivery_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // started from a claim: receive the defective units (RT) or send the replacement (SO)
  const [claim, setClaim] = useState<ClaimRef | null>(null);
  useEffect(() => {
    const cid = claimId ?? (head.claim_id || null);
    if (!cid || claim?.id === cid) return;
    supabase.from("claims").select("id, claim_no, company_id, company_name, contact_name, site_name, reported_sns").eq("id", cid).single()
      .then(({ data }) => {
        if (!data) return;
        const c = data as ClaimRef;
        setClaim(c);
        if (id) return;
        setHead((h) => ({
          ...h, claim_id: c.id, partner_name: c.company_name || c.contact_name, company_id: c.company_id, ref_no: `เคลม ${c.claim_no}`, site_name: c.site_name,
          ...(t === "RT" ? { reason: `รับของเสียจากเคลม ${c.claim_no}` } : { note: `ส่งของเปลี่ยนตามเคลม ${c.claim_no}` }),
        }));
        if (t === "RT" && c.reported_sns.length) { setCond("defective"); addSns(c.reported_sns.join("\n"), "defective"); }
      });
  }, [claimId, head.claim_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // started from a web reservation (RS-…)
  const [resv, setResv] = useState<ReservationRef | null>(null);
  useEffect(() => {
    const rid = reservationId ?? (head.reservation_id || null);
    if (!rid || resv?.id === rid) return;
    supabase.from("reservations").select("id, code, company_id, companies(name, tax_id), profiles(full_name, email), reservation_items(sku, label, qty)").eq("id", rid).single()
      .then(({ data }) => {
        if (!data) return;
        const r = data as unknown as ReservationRef;
        setResv(r);
        if (id) return;
        setHead((h) => ({
          ...h, reservation_id: r.id, company_id: r.company_id, ref_no: r.code,
          partner_name: r.companies?.name ?? r.profiles?.full_name ?? r.profiles?.email ?? null, partner_tax_id: r.companies?.tax_id ?? null,
        }));
      });
  }, [reservationId, head.reservation_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof StockDoc, v: string | null) => setHead((h) => ({ ...h, [k]: v || null }));

  // add scanned SNs: in-docs use the chosen code; others look the SN up to get its code
  async function addSns(raw: string, condFor: Condition = cond) {
    const sns = splitSns(raw);
    if (!sns.length) return;
    const have = new Set(items.map((i) => snKey(i.sn)));
    const fresh = sns.filter((s, i) => !have.has(snKey(s)) && sns.findIndex((x) => snKey(x) === snKey(s)) === i);
    const w: string[] = [];
    if (fresh.length < sns.length) w.push(`ข้าม SN ซ้ำ ${sns.length - fresh.length} ตัว`);
    if (!fresh.length) { setWarn(w); setScan(""); return; }

    if (t === "OB" || t === "GR" || t === "GN") {
      const code = sku.trim().toUpperCase();
      if (!code) { setWarn(["เลือกรหัสสินค้าก่อนสแกน"]); return; }
      setItems((list) => uniq(list, fresh.map((sn) => ({ sku: code, description: skuName.get(code) ?? null, sn, condition: cond }))));
      const { data } = await supabase.from("serials").select("sn, status").in("sn_key", fresh.map(snKey));
      (data ?? []).filter((s) => ["in_stock", "reserved", "borrowed", "withdrawn"].includes(s.status))
        .forEach((s) => w.push(`${s.sn} มีอยู่ในระบบแล้ว (${SERIAL_STATUS_LABEL[s.status as Serial["status"]]})`));
    } else {
      const { data } = await supabase.from("serials").select("*").in("sn_key", fresh.map(snKey));
      const found = new Map(((data ?? []) as Serial[]).map((s) => [s.sn_key, s]));
      const add: DocItem[] = [];
      for (const sn of fresh) {
        const s = found.get(snKey(sn));
        if (!s) { w.push(`ไม่พบ ${sn} ในระบบ`); continue; }
        if (t === "RT") {
          if (!["borrowed", "withdrawn", "sold"].includes(s.status)) w.push(`${sn} ไม่ได้อยู่นอกคลัง (${SERIAL_STATUS_LABEL[s.status]})`);
        } else if (s.warehouse_id !== head.warehouse_id) w.push(`${sn} ไม่ได้อยู่ในคลังที่เลือก (${SERIAL_STATUS_LABEL[s.status]})`);
        else if (["SO", "BR", "WD", "RV"].includes(t) && s.condition !== "good") w.push(`${sn} เป็นของเสีย`);
        else if (t === "SO" ? !["in_stock", "reserved"].includes(s.status) : t !== "WO" && t !== "TR" && s.status !== "in_stock") w.push(`${sn} สถานะ${SERIAL_STATUS_LABEL[s.status]}`);
        add.push({ sku: s.sku, description: s.description ?? skuName.get(s.sku) ?? null, sn: s.sn, condition: t === "RT" ? condFor : s.condition });
      }
      setItems((list) => uniq(list, add));
    }
    setWarn(w);
    setScan("");
    scanRef.current?.focus();
  }

  async function pullOpen() {
    if (!head.return_of) return;
    const { data, error } = await supabase.rpc("stock_doc_open_sns", { p_doc: head.return_of });
    if (error) return setErr(errorMessage(error));
    const have = new Set(items.map((i) => snKey(i.sn)));
    const add = ((data ?? []) as { sku: string; description: string | null; sn: string }[])
      .filter((r) => !have.has(snKey(r.sn)))
      .map((r) => ({ sku: r.sku, description: r.description, sn: r.sn, condition: cond }));
    setItems((l) => [...l, ...add]);
    setWarn(add.length ? [] : ["ไม่มี SN ค้างคืนในเอกสารนี้"]);
  }

  async function save(): Promise<string | null> {
    setErr(""); setMsg("");
    const payload = { ...head };
    const { data, error } = await supabase.rpc("save_stock_doc", {
      p_id: id ?? head.id ?? null,
      p_doc: payload,
      p_items: items.map((i) => ({ sku: i.sku, description: i.description, sn: i.sn, condition: i.condition, note: i.note ?? null })),
    });
    if (error) { setErr(errorMessage(error)); return null; }
    let d = data as StockDoc;
    if (head.reservation_id && !d.reservation_id) {
      const r = await supabase.rpc("save_stock_doc_reservation", { p_id: d.id, p_reservation: head.reservation_id });
      if (r.error) { setErr(errorMessage(r.error)); return null; }
      d = { ...d, reservation_id: head.reservation_id };
    }
    setHead(d);
    if (pendingFiles.length) {
      try { await uploadDocFiles(d.id, pendingFiles); setPendingFiles([]); setFileTick((x) => x + 1); }
      catch (e) { setErr("บันทึกเอกสารแล้ว แต่อัปโหลดรูปไม่สำเร็จ: " + errorMessage(e)); }
    }
    onChanged(d.id);
    return d.id;
  }
  async function run(kind: string, fn: () => Promise<void>) { setBusy(kind); try { await fn(); } finally { setBusy(""); } }

  const onSave = () => run("save", async () => { if (await save()) setMsg("บันทึกร่างแล้ว"); });
  const onPost = () => run("post", async () => {
    if (!confirm(`ยืนยัน${DOC_LABEL[t]} ${items.length} ชิ้น? ยืนยันแล้วแก้ไม่ได้`)) return;
    const did = await save();
    if (!did) return;
    const { data, error } = await supabase.rpc("post_stock_doc", { p_id: did });
    if (error) return setErr(errorMessage(error));
    setHead(data as StockDoc);
    setMsg("ยืนยันแล้ว สต๊อกและสถานะ SN อัปเดตแล้ว");
    onChanged(did);
  });
  const onCheck = (ok: boolean) => run("check", async () => {
    let did = head.id ?? null;
    if (ok && canSave) did = await save();
    if (!did) return;
    const { data, error } = await supabase.rpc("check_stock_doc", { p_id: did, p_ok: ok });
    if (error) return setErr(errorMessage(error));
    setHead(data as StockDoc);
    setMsg(ok ? "ตรวจแล้ว รอผู้อนุมัติอีกคนยืนยัน" : "ถอนการตรวจแล้ว");
    onChanged(did);
  });
  const onCancel = () => run("cancel", async () => {
    const reason = prompt(head.status === "posted" ? "เหตุผลที่ยกเลิก (SN จะกลับไปสถานะก่อนเอกสารนี้)" : "เหตุผลที่ยกเลิก");
    if (!reason?.trim()) return;
    const { data, error } = await supabase.rpc("cancel_stock_doc", { p_id: head.id, p_reason: reason });
    if (error) return setErr(errorMessage(error));
    setHead(data as StockDoc);
    onChanged(head.id!);
  });
  const onDelete = () => run("delete", async () => {
    if (!head.id || !confirm("ลบร่างนี้?")) return;
    const { error } = await supabase.rpc("delete_stock_draft", { p_id: head.id });
    if (error) return setErr(errorMessage(error));
    onChanged(head.id);
    onClose();
  });

  const groups = useMemo(() => {
    const m = new Map<string, { sku: string; description: string | null; rows: { item: DocItem; idx: number }[] }>();
    items.forEach((item, idx) => {
      const g = m.get(item.sku) ?? { sku: item.sku, description: item.description, rows: [] };
      g.rows.push({ item, idx });
      m.set(item.sku, g);
    });
    return [...m.values()];
  }, [items]);

  if (loading) return <Loading />;
  const needCheck = (cfg.rows[0]?.check_types ?? []).includes(t);
  const postBlocked = needCheck && (!head.checked_at || head.checked_by === profile?.id);
  const wh = (wid: string | null | undefined) => warehouses.find((w) => w.id === wid)?.name ?? "-";
  const showCond = t === "RT" || dir === "in";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onClose} className="text-sm font-semibold text-navy-700 hover:underline">← กลับไปรายการเอกสาร</button>
        <h2 className="text-lg font-bold text-navy-900">{DOC_LABEL[t]} {head.doc_no && <span className="font-mono">{head.doc_no}</span>}</h2>
        {head.status && <Badge tone={DOC_STATUS_TONE[head.status]}>{DOC_STATUS_LABEL[head.status]}</Badge>}
        <div className="ml-auto flex gap-2">
          {head.id && <Button variant="secondary" onClick={() => printStockDoc(head as StockDoc, items, warehouses)}>พิมพ์</Button>}
        </div>
      </div>

      {head.status === "cancelled" && <Alert>ยกเลิกเมื่อ {formatDateTime(head.cancelled_at)} · {head.cancel_reason}</Alert>}
      {head.status === "posted" && <Alert tone="green">ยืนยันเมื่อ {formatDateTime(head.posted_at)}{head.checked_at ? ` · ผ่านผู้ตรวจเมื่อ ${formatDateTime(head.checked_at)}` : ""}</Alert>}
      {!locked && needCheck && (head.checked_at
        ? <Alert tone="green">ผู้ตรวจ (ชั้นที่ 1) ตรวจแล้วเมื่อ {formatDateTime(head.checked_at)}{head.checked_by === profile?.id ? " โดยคุณ ผู้อนุมัติต้องเป็นคนอื่น" : " รอผู้อนุมัติยืนยัน"}</Alert>
        : <Alert tone="amber">เอกสารประเภทนี้อนุมัติ 2 ชั้น: ผู้ตรวจต้องกด "ตรวจแล้ว" ก่อน แล้วผู้อนุมัติอีกคนจึงยืนยันได้ ถ้าแก้ไขหลังตรวจ ต้องตรวจใหม่</Alert>)}

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          {!id && !head.id && (
            <Field label="ประเภทเอกสาร">
              <Select value={t} onChange={(e) => { setHead((h) => ({ ...h, doc_type: e.target.value as DocType })); setItems([]); }}>
                {DOC_TYPES.filter((d) => d.type !== "OB" || isAdmin).map((d) => <option key={d.type} value={d.type}>{d.type} · {d.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="วันที่เอกสาร" required>
            <Input type="date" disabled={locked} value={head.doc_date ?? ""} onChange={(e) => set("doc_date", e.target.value)} />
          </Field>
          <Field label={t === "TR" ? "จากคลัง" : dir === "in" ? "รับเข้าคลัง" : "จากคลัง"} required>
            <Select disabled={locked || items.length > 0 && dir !== "in"} value={head.warehouse_id ?? ""} onChange={(e) => set("warehouse_id", e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
          {t === "TR" && (
            <Field label="ไปคลัง" required>
              <Select disabled={locked} value={head.to_warehouse_id ?? ""} onChange={(e) => set("to_warehouse_id", e.target.value)}>
                <option value="">— เลือก —</option>
                {warehouses.filter((w) => w.id !== head.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}
          {PARTNER_LABEL[t] && (
            <Field label={PARTNER_LABEL[t]!} required={["SO", "BR", "WD", "RV", "RT"].includes(t)}>
              <Input disabled={locked} list="sd-companies" value={head.partner_name ?? ""} onChange={(e) => {
                const v = e.target.value;
                const c = companies.rows.find((x) => x.name === v);
                setHead((h) => ({ ...h, partner_name: v || null, ...(c ? { partner_tax_id: c.tax_id, company_id: c.id } : { company_id: null }) }));
              }} />
              <datalist id="sd-companies">{companies.rows.map((c) => <option key={c.id} value={c.name}>{c.tax_id}</option>)}</datalist>
            </Field>
          )}
          {["SO", "BR", "WD", "RV", "RT"].includes(t) && (
            <Field label="เลขผู้เสียภาษี">
              <Input disabled={locked} value={head.partner_tax_id ?? ""} onChange={(e) => set("partner_tax_id", e.target.value)} />
            </Field>
          )}
          <Field label={REF_LABEL[t] ?? "เลขที่อ้างอิง"} required={t === "GR" || t === "GN"}>
            <Input disabled={locked} value={head.ref_no ?? ""} onChange={(e) => set("ref_no", e.target.value)} />
          </Field>
          {t === "SO" && (
            <Field label="เลขที่ PO ของลูกค้า">
              <Input disabled={locked} value={head.customer_po ?? ""} onChange={(e) => set("customer_po", e.target.value)} />
            </Field>
          )}
          {["SO", "BR", "WD"].includes(t) && (
            <Field label="ไซต์ / สถานที่ใช้งาน">
              <Input disabled={locked} value={head.site_name ?? ""} onChange={(e) => set("site_name", e.target.value)} />
            </Field>
          )}
          {["BR", "WD", "RV"].includes(t) && (
            <Field label={t === "RV" ? "จองถึงวันที่" : "กำหนดคืน"} required={t === "BR"}>
              <Input type="date" disabled={locked} value={head.due_date ?? ""} onChange={(e) => set("due_date", e.target.value)} />
            </Field>
          )}
          {t === "RT" && (
            <Field label="คืนจากเอกสาร" hint="เลือกแล้วกดดึง SN ที่ยังไม่คืน หรือเว้นว่างถ้าเป็นลูกค้าคืน/ของเคลม">
              <div className="flex gap-2">
                <Select disabled={locked} value={head.return_of ?? ""} onChange={(e) => {
                  const d = outDocs.rows.find((x) => x.id === e.target.value);
                  setHead((h) => ({ ...h, return_of: e.target.value || null, ...(d ? { partner_name: d.partner_name, partner_tax_id: d.partner_tax_id, company_id: d.company_id } : {}) }));
                }}>
                  <option value="">— ไม่อ้างอิง —</option>
                  {outDocs.rows.map((d) => <option key={d.id} value={d.id}>{d.doc_no} · {d.partner_name ?? ""} · {formatDate(d.doc_date)}</option>)}
                </Select>
                {!locked && head.return_of && <Button variant="secondary" onClick={pullOpen}>ดึง SN</Button>}
              </div>
            </Field>
          )}
          {["WO", "RT", "OB", "GN", "GR", "TR"].includes(t) && (
            <Field label={t === "WO" ? "เหตุผลที่จำหน่ายออก" : "เหตุผล / หมายเหตุการรับ"} required={t === "WO"}>
              <Input disabled={locked} value={head.reason ?? ""} onChange={(e) => set("reason", e.target.value)}
                placeholder={t === "WO" ? "เช่น เสียหายซ่อมไม่ได้ / ส่งคืนผู้ขาย" : ""} />
            </Field>
          )}
          <div className="sm:col-span-3">
            <Field label="หมายเหตุ">
              <Input disabled={locked} value={head.note ?? ""} onChange={(e) => set("note", e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      {claim && (
        <Alert tone="navy">
          จากงานเคลม <b>{claim.claim_no}</b> · {claim.company_name ?? claim.contact_name} · SN ที่แจ้ง: <span className="font-mono">{claim.reported_sns.join(", ") || "-"}</span>
          {t === "RT" ? " · ระบบใส่ SN ที่แจ้งเป็นสภาพเสียให้แล้ว (SN ที่ไม่เคยขายจากระบบจะไม่ถูกเพิ่ม)" : " · สแกน SN ตัวใหม่ที่ส่งเปลี่ยนให้ลูกค้า"}
        </Alert>
      )}
      {resv && (
        <Alert tone="navy">
          ตามใบจอง {resv.code}:{" "}
          {resv.reservation_items.map((i) => {
            const n = items.filter((x) => x.sku === i.sku.toUpperCase()).length;
            return <span key={i.sku} className="mr-3 inline-block">{i.sku} × {Number(i.qty)}{" "}<b className={n === Number(i.qty) ? "text-emerald-700" : "text-amber-700"}>(สแกนแล้ว {n})</b></span>;
          })}
        </Alert>
      )}
      {delivery && (
        <Alert tone="navy">
          ตามใบส่งสินค้า {delivery.doc_no} ({formatDate(delivery.delivery_date)}):{" "}
          {delivery.delivery_items.map((i) => {
            const n = items.filter((x) => x.sku === i.model.toUpperCase()).length;
            return <span key={i.model} className="mr-3 inline-block">{i.model} × {i.qty}{" "}<b className={n === Number(i.qty) ? "text-emerald-700" : "text-amber-700"}>(สแกนแล้ว {n})</b></span>;
          })}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-navy-900">รายการ Serial Number ({items.length} ชิ้น)</h3>
          {!locked && items.length > 0 && <button onClick={() => setItems([])} className="text-xs text-red-600 hover:underline">ล้างทั้งหมด</button>}
        </div>

        {!locked && (
          <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 lg:grid-cols-[16rem_1fr]">
            <div className="space-y-2">
              {(t === "OB" || t === "GR" || t === "GN") && (
                <Field label="รหัสสินค้า" required>
                  <Input list="sd-skus" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} placeholder="เลือกหรือพิมพ์รหัส" />
                  <datalist id="sd-skus">{stock.rows.map((r) => <option key={r.sku} value={r.sku}>{r.description}</option>)}</datalist>
                  {sku && <p className="mt-1 text-xs text-slate-500">{skuName.get(sku) ?? "รหัสใหม่ (ไม่มีในสต๊อกเดิม)"}</p>}
                </Field>
              )}
              {showCond && (
                <Field label="สภาพสินค้า">
                  <Select value={cond} onChange={(e) => setCond(e.target.value as Condition)}>
                    <option value="good">ดี</option>
                    <option value="defective">เสีย</option>
                  </Select>
                </Field>
              )}
              {dir !== "in" && <p className="text-xs text-slate-500">สแกน SN แล้วระบบดึงรหัสสินค้าให้เอง</p>}
            </div>
            <div>
              <textarea ref={scanRef} rows={3} value={scan} onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addSns(scan); } }}
                placeholder="สแกนบาร์โค้ด SN (กด Enter ทีละตัว) หรือวางหลายตัวจาก Excel แล้วกด เพิ่ม"
                className="block w-full rounded-lg border-0 bg-white px-3 py-2.5 font-mono text-sm shadow-sm ring-1 ring-inset ring-slate-300 placeholder:font-sans placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-navy-600" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => addSns(scan)}>+ เพิ่ม SN</Button>
                <CameraScan onScan={(sns) => addSns(sns.join("\n"))} last={items.length ? { text: `${items.length} SN · ล่าสุด ${items[items.length - 1].sn}`, tone: "green" } : null} />
                <PhotoScan knownSkus={new Set(stock.rows.map((r) => r.sku))} existing={new Set(items.map((i) => snKey(i.sn)))} onAdd={(sns, photos) => { addSns(sns.join("\n")); if (photos.length) setPendingFiles((p) => [...p, ...photos]); }} />
                <span className="text-xs text-slate-500">แยกด้วยบรรทัดใหม่ เครื่องหมาย , หรือแท็บ</span>
              </div>
            </div>
          </div>
        )}
        {warn.length > 0 && <div className="mt-3"><Alert tone="amber">{warn.map((w, i) => <div key={i}>{w}</div>)}</Alert></div>}

        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.sku}>
              <p className="text-sm font-semibold text-navy-900">{g.sku} <span className="font-normal text-slate-500">{g.description ?? skuName.get(g.sku) ?? ""}</span> · {g.rows.length} ชิ้น</p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {g.rows.map(({ item, idx }) => (
                  <div key={item.sn} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
                    <span className="w-6 text-right text-xs text-slate-400">{idx + 1}</span>
                    <span className="flex-1 truncate font-mono text-sm">{item.sn}</span>
                    {showCond ? (
                      locked ? <Badge tone={item.condition === "good" ? "green" : "red"}>{CONDITION_LABEL[item.condition]}</Badge> : (
                        <select value={item.condition} onChange={(e) => setItems((l) => l.map((x, i) => i === idx ? { ...x, condition: e.target.value as Condition } : x))}
                          className={cx("rounded border-0 bg-transparent text-xs", item.condition === "good" ? "text-emerald-700" : "text-red-700")}>
                          <option value="good">ดี</option><option value="defective">เสีย</option>
                        </select>
                      )
                    ) : null}
                    {!locked && <button onClick={() => setItems((l) => l.filter((_, i) => i !== idx))} className="px-1 text-slate-400 hover:text-red-600" aria-label="ลบ">✕</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!items.length && <p className="text-sm text-slate-500">ยังไม่มี SN</p>}
        </div>
      </Card>

      <Card>
        <DocFiles docId={head.id ?? null} draft={!locked} pending={pendingFiles} setPending={setPendingFiles} tick={fileTick} />
        {head.id && pendingFiles.length > 0 && <p className="mt-2 text-xs text-amber-700">มีรูปรออัปโหลด {pendingFiles.length} ไฟล์ กดบันทึกร่างหรือยืนยันเพื่ออัปโหลด</p>}
      </Card>

      {err && <Alert>{err}</Alert>}
      {msg && <Alert tone="green">{msg}</Alert>}
      <div className="flex flex-wrap gap-2">
        {!locked && canSave && <Button variant="secondary" onClick={onSave} loading={busy === "save"}>บันทึกร่าง</Button>}
        {!locked && needCheck && canCheck && (head.checked_at
          ? <Button variant="secondary" onClick={() => onCheck(false)} loading={busy === "check"}>ถอนการตรวจ</Button>
          : <Button variant="secondary" onClick={() => onCheck(true)} loading={busy === "check"} disabled={!items.length}>✓ ตรวจแล้ว ถูกต้อง (ชั้นที่ 1)</Button>)}
        {!locked && canPost && <Button onClick={onPost} loading={busy === "post"} disabled={!items.length || postBlocked}>ยืนยันและ{dir === "in" ? "รับเข้า" : dir === "out" ? "ตัดออก" : t === "TR" ? "โอน" : "จอง"}สต๊อก</Button>}
        {!locked && !canPost && <p className="self-center text-sm text-slate-500">บันทึกร่างแล้วให้ผู้มีสิทธิ์อนุมัติกดยืนยัน</p>}
        {head.status === "draft" && <Button variant="secondary" onClick={onDelete} loading={busy === "delete"}>ลบร่าง</Button>}
        {head.status === "posted" && canPost && <Button variant="secondary" onClick={onCancel} loading={busy === "cancel"}>ยกเลิกเอกสาร</Button>}
        {head.status === "posted" && <span className="self-center text-xs text-slate-500">คลัง: {wh(head.warehouse_id)}{t === "TR" ? ` → ${wh(head.to_warehouse_id)}` : ""}</span>}
      </div>
    </div>
  );
}
