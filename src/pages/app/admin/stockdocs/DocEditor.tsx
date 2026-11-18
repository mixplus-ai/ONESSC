import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Loading, Select, cx } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { fmtWarranty, formatDate, formatDateTime } from "../../../../lib/catalog";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import {
  CONDITION_LABEL, DIR, DOC_LABEL, DOC_STATUS_LABEL, DOC_STATUS_TONE, DOC_TYPES, PARTNER_LABEL, REF_LABEL, SERIAL_STATUS_LABEL,
  TO_WH, POST_EFFECT, docRoute, TRUCK_TYPES, snKey, splitSns, type Condition, type DocItem, type DocType, type Serial, type StockDoc, type Warehouse,
} from "../../../../lib/stockdocs";
import { DocFiles, uploadDocFiles, type PendingFile } from "./DocFiles";
import { CameraScan } from "./CameraScan";
import { PhotoScan } from "./PhotoScan";
import { exportDeliveryPng, exportDeliveryXlsx, printDeliveryDetail, printDeliverySns } from "./print";
import { isReserveWarehouse, soFromRv } from "./fromRv";
import { SnPicker } from "./SnPicker";
import { ProductSearch } from "./ProductSearch";
import { SOURCE_LABEL, listSources, loadSource, type PlanLine, type SourceKind, type SourceOption, type SourcePick } from "./docSources";

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

export function DocEditor({ id, type, warehouses, deliveryId, claimId, reservationId, onClose, onChanged, onOpen }: {
  id: string | null; type: DocType; warehouses: Warehouse[]; deliveryId?: string | null; claimId?: string | null; reservationId?: string | null;
  onClose: () => void; onChanged: (id: string) => void; onOpen?: (id: string) => void;
}) {
  const { can, isAdmin, profile } = useAuth();
  const canPost = can("stock.post");
  const canSave = can("stock.docs") || can("stock.post");
  const canCheck = can("stock.check") || can("stock.post");
  const cfg = useRows<{ check_types: DocType[] }>(() => supabase.from("stock_config").select("check_types").eq("id", 1));
  // receipts go into the main warehouse first (role "main" when the claims update has set it, else the first in order)
  const mainWh = (warehouses.find((w) => w.role === "main" && !isReserveWarehouse(w) && !/ยืม|เสีย|ตัวอย่าง|พรีเมียม|พลีเมี่ยม/.test(w.name)) ?? warehouses.find((w) => w.role === "main") ?? warehouses[0])?.id;
  // RV (ใบจอง): reserved SNs move to the reservation warehouse (คลังจอง) when there is one
  // default destination: RV → คลังจอง, WD → คลังยืม (when such a warehouse exists); others none
  const defaultTo = (dt: DocType, from: string | undefined) => {
    const pick = dt === "RV" ? isReserveWarehouse : dt === "WD" ? (w: Warehouse) => /ยืม|LEND|BORROW/i.test(`${w.code} ${w.name}`) : null;
    return (pick && warehouses.find((w) => pick(w) && w.id !== from)?.id) || null;
  };
  const [head, setHead] = useState<Head>({ doc_type: type, doc_date: today(), warehouse_id: mainWh, to_warehouse_id: defaultTo(type, mainWh) });
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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
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
  // product default warranty per code (placeholder on SO lines; the PI line can override it for a promotion)
  const defWar = useRows<{ sku: string; warranty_months: number | null; products: { warranty_months: number | null } | null }>(
    () => t === "SO" ? supabase.from("product_variants").select("sku, warranty_months, products(warranty_months)") : Promise.resolve({ data: [], error: null }),
    [t],
  );
  const defMonths = useMemo(() => new Map(defWar.rows.map((r) => [r.sku.toUpperCase(), r.warranty_months ?? r.products?.warranty_months ?? null])), [defWar.rows]);
  const groupWarranty = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => { if (i.warranty_months != null && !m.has(i.sku)) m.set(i.sku, i.warranty_months); });
    return m;
  }, [items]);
  function setGroupWarranty(code: string, v: string) {
    const n = v.trim() === "" ? null : Math.max(0, Math.min(600, Math.round(Number(v))));
    if (n !== null && Number.isNaN(n)) return;
    setItems((l) => l.map((x) => x.sku === code ? { ...x, warranty_months: n } : x));
  }
  async function fixPostedWarranty(code: string) {
    if (!head.id) return;
    const cur = groupWarranty.get(code);
    const v = prompt(`ประกันของ ${code} ในใบนี้ (เดือน) เว้นว่าง = ตามข้อมูลสินค้า`, cur != null ? String(cur) : "");
    if (v === null) return;
    const n = v.trim() === "" ? null : Math.round(Number(v));
    if (n !== null && (Number.isNaN(n) || n < 0 || n > 600)) return setErr("ประกันต้องเป็นตัวเลข 0–600 เดือน");
    const { error } = await supabase.rpc("set_doc_item_warranty", { p_doc: head.id, p_sku: code, p_months: n });
    if (error) return setErr(errorMessage(error));
    const it = await supabase.from("stock_doc_items").select("*").eq("doc_id", head.id).order("sort");
    setItems((it.data ?? []) as DocItem[]);
    setMsg(`แก้ประกัน ${code} แล้ว`);
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [d, it] = await Promise.all([
        supabase.from("stock_docs").select("*").eq("id", id).single(),
        supabase.from("stock_doc_items").select("*").eq("doc_id", id).order("sort"),
      ]);
      if (d.error) setErr(errorMessage(d.error));
      else { setHead(d.data as StockDoc); setDocLines(((d.data as StockDoc).lines ?? []).map((l) => ({ ...l, qty: Number(l.qty) || 0 }))); }
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
        setPlan({ kind: "reservation", code: r.code, lines: r.reservation_items.map((i) => ({ sku: i.sku.toUpperCase(), label: i.label, qty: Number(i.qty) })) });
        if (id) return;
        setHead((h) => ({
          ...h, reservation_id: r.id, company_id: r.company_id, ref_no: r.code,
          partner_name: r.companies?.name ?? r.profiles?.full_name ?? r.profiles?.email ?? null, partner_tax_id: r.companies?.tax_id ?? null,
        }));
      });
  }, [reservationId, head.reservation_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // SO / WD made from a reservation (RV): show which one and what it holds
  const [fromRv, setFromRv] = useState<{ id: string; doc_no: string } | null>(null);
  useEffect(() => {
    if ((t !== "SO" && t !== "WD") || !head.return_of || fromRv?.id === head.return_of) return;
    supabase.from("stock_docs").select("id, doc_no, doc_type").eq("id", head.return_of).single()
      .then(({ data }) => { if (data?.doc_type === "RV") setFromRv({ id: data.id, doc_no: data.doc_no }); });
  }, [t, head.return_of]); // eslint-disable-line react-hooks/exhaustive-deps

  // what the document should hold, from the quotation / reservation it was filled from
  const [plan, setPlan] = useState<{ kind: SourceKind; code: string; lines: PlanLine[] } | null>(null);
  const [docLines, setDocLines] = useState<{ sku: string; description: string | null; qty: number }[]>([]);
  // lines from the quotation / reservation become product rows (kept on the document when saved)
  useEffect(() => {
    if (!plan || locked) return;
    setDocLines((l) => {
      const have = new Set(l.map((x) => x.sku));
      return [...l, ...plan.lines.filter((x) => !have.has(x.sku)).map((x) => ({ sku: x.sku, description: x.label, qty: x.qty }))];
    });
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!head.quote_id || plan?.kind === "quote") return;
    loadSource("quote", head.quote_id).then((p) => p && setPlan({ kind: "quote", code: p.code, lines: p.lines }));
  }, [head.quote_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [srcKind, setSrcKind] = useState<SourceKind | "">("");
  const [srcOpts, setSrcOpts] = useState<SourceOption[]>([]);
  const srcKinds: SourceKind[] = t === "SO" || t === "WD" ? ["quote", "reservation", "rv"] : ["SO", "BR", "RV"].includes(t) ? ["quote", "reservation"] : [];
  useEffect(() => { setSrcOpts([]); if (srcKind) listSources(srcKind).then(setSrcOpts); }, [srcKind]);
  async function pullSource(kind: SourceKind, sid: string) {
    if (!sid) return;
    const p: SourcePick | null = await loadSource(kind, sid);
    if (!p) return setErr("ไม่พบเอกสารที่เลือก");
    setHead((h) => ({
      ...h, partner_name: p.partner_name ?? h.partner_name, partner_tax_id: p.partner_tax_id ?? h.partner_tax_id, company_id: p.company_id ?? h.company_id,
      ref_no: h.ref_no || p.code,
      ...(kind === "quote" ? { quote_id: p.id } : kind === "reservation" ? { reservation_id: p.id } : { return_of: p.id, ...(p.warehouse_id ? { warehouse_id: p.warehouse_id } : {}) }),
    }));
    if (kind === "rv") {
      setFromRv({ id: p.id, doc_no: p.code });
      setItems((l) => uniq(kind === "rv" && p.warehouse_id && p.warehouse_id !== head.warehouse_id ? [] : l, p.sns ?? []));
      setWarn(p.sns?.length ? [] : ["ใบจองนี้ไม่มี SN ที่ยังจองอยู่"]);
    }
    setPlan({ kind, code: p.code, lines: p.lines });
    setMsg(`ดึงรายการจาก${SOURCE_LABEL[kind]} ${p.code} แล้ว${kind === "rv" ? "" : " เลือก SN ของแต่ละรายการด้านล่าง"}`);
  }
  const [pickSku, setPickSku] = useState("");
  const pickRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof StockDoc, v: string | null) => setHead((h) => ({ ...h, [k]: v || null }));

  // add scanned SNs: in-docs use the chosen code; others look the SN up to get its code
  async function addSns(raw: string, condFor: Condition = cond, forceSku?: string) {
    const sns = splitSns(raw);
    if (!sns.length) return;
    const have = new Set(items.map((i) => snKey(i.sn)));
    const fresh = sns.filter((s, i) => !have.has(snKey(s)) && sns.findIndex((x) => snKey(x) === snKey(s)) === i);
    const w: string[] = [];
    if (fresh.length < sns.length) w.push(`ข้าม SN ซ้ำ ${sns.length - fresh.length} ตัว`);
    if (!fresh.length) { setWarn(w); setScan(""); return; }

    if (t === "OB" || t === "GR" || t === "GN") {
      const code = (forceSku ?? sku).trim().toUpperCase();
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
        if (forceSku && s.sku !== forceSku) { w.push(`${sn} เป็นรหัส ${s.sku} ไม่ใช่ ${forceSku}`); continue; }
        if (t === "RT") {
          if (!["borrowed", "withdrawn", "sold"].includes(s.status)) w.push(`${sn} ไม่ได้อยู่นอกคลัง (${SERIAL_STATUS_LABEL[s.status]})`);
        } else if (s.warehouse_id !== head.warehouse_id) w.push(`${sn} ไม่ได้อยู่ในคลังที่เลือก (${SERIAL_STATUS_LABEL[s.status]})`);
        else if (["SO", "BR", "WD", "RV"].includes(t) && s.condition !== "good") w.push(`${sn} เป็นของเสีย`);
        else if (t === "SO" || t === "WD" ? !["in_stock", "reserved"].includes(s.status) : t !== "WO" && t !== "TR" && s.status !== "in_stock") w.push(`${sn} สถานะ${SERIAL_STATUS_LABEL[s.status]}`);
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
    const payload = { ...head, to_warehouse_id: TO_WH[t] === "none" ? null : head.to_warehouse_id ?? null };
    const { data, error } = await supabase.rpc("save_stock_doc", {
      p_id: id ?? head.id ?? null,
      p_doc: payload,
      p_items: items.map((i) => ({ sku: i.sku, description: i.description, sn: i.sn, condition: i.condition, note: i.note ?? null, warranty_months: t === "SO" ? groupWarranty.get(i.sku) ?? null : null })),
    });
    if (error) { setErr(errorMessage(error)); return null; }
    let d = data as StockDoc;
    if (head.reservation_id && !d.reservation_id) {
      const r = await supabase.rpc("save_stock_doc_reservation", { p_id: d.id, p_reservation: head.reservation_id });
      if (r.error) { setErr(errorMessage(r.error)); return null; }
      d = { ...d, reservation_id: head.reservation_id };
    }
    {
      const lines = tableRows.map((r) => ({ sku: r.sku, description: r.description, qty: Math.max(r.qty, r.rows.length) }));
      const r = await supabase.rpc("save_stock_doc_lines", { p_id: d.id, p_lines: lines });
      if (r.error) { setErr(errorMessage(r.error)); return null; }
      d = { ...d, lines };
    }
    if (head.quote_id && !d.quote_id) {
      const r = await supabase.rpc("save_stock_doc_quote", { p_id: d.id, p_quote: head.quote_id });
      if (r.error) { setErr(errorMessage(r.error)); return null; }
      d = { ...d, quote_id: head.quote_id };
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
    if (short.length) return setErr(`ยังใส่ SN ไม่ครบ: ${short.map((r) => `${r.sku} ${r.rows.length}/${r.qty}`).join(", ")} (แก้จำนวนหรือใส่ SN ให้ครบก่อนยืนยัน)`);
    if (!confirm(`อนุมัติ${DOC_LABEL[t]} ${items.length} ชิ้น?\nต้นทาง: ${route.from}\nปลายทาง: ${route.to}\nSN ${effect}\nอนุมัติแล้วแก้ไม่ได้`)) return;
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
  // sold after a reservation: make the delivery note (SO) from the SNs still reserved here, cut from the reservation warehouse
  const onSold = () => run("sold", async () => {
    if (!head.id) return;
    setErr("");
    try {
      const so = await soFromRv(head.id);
      onChanged(so);
      if (onOpen) onOpen(so); else setMsg("สร้างใบส่งของแล้ว ดูได้ในรายการเอกสาร");
    } catch (e) { setErr(errorMessage(e)); }
  });
  const onDelete = () => run("delete", async () => {
    if (!head.id || !confirm("ลบร่างนี้?")) return;
    const { error } = await supabase.rpc("delete_stock_draft", { p_id: head.id });
    if (error) return setErr(errorMessage(error));
    onChanged(head.id);
    onClose();
  });

  // product rows: products with SNs, plus planned / added products still without SNs
  const [addSku, setAddSku] = useState("");
  function addProduct(picked?: string) {
    const code = (picked ?? addSku).trim().toUpperCase();
    if (!code) return;
    if (!skuName.has(code) && !confirm(`ไม่พบรหัส ${code} ในสต๊อก เพิ่มเป็นรหัสใหม่?`)) return;
    setDocLines((l) => (l.some((x) => x.sku === code) ? l : [...l, { sku: code, description: skuName.get(code) ?? null, qty: 1 }]));
    setAddSku("");
    if (dir !== "in") setPickSku(code); else setSku(code);
  }
  const groups = useMemo(() => {
    const m = new Map<string, { sku: string; description: string | null; rows: { item: DocItem; idx: number }[] }>();
    items.forEach((item, idx) => {
      const g = m.get(item.sku) ?? { sku: item.sku, description: item.description, rows: [] };
      g.rows.push({ item, idx });
      m.set(item.sku, g);
    });
    return [...m.values()];
  }, [items]);
  // rows in line order first, then codes that only have SNs; qty = wanted quantity (defaults to the SN count)
  const tableRows = useMemo(() => {
    const bySku = new Map(groups.map((g) => [g.sku, g]));
    const rows = docLines.map((l) => ({ sku: l.sku, description: bySku.get(l.sku)?.description ?? l.description ?? skuName.get(l.sku) ?? null, rows: bySku.get(l.sku)?.rows ?? [], qty: l.qty }));
    const seen = new Set(docLines.map((l) => l.sku));
    groups.filter((g) => !seen.has(g.sku)).forEach((g) => rows.push({ ...g, qty: g.rows.length }));
    return rows;
  }, [groups, docLines, skuName]);
  const setLineQty = (code: string, v: string) => {
    const n = Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));
    setDocLines((l) => l.some((x) => x.sku === code) ? l.map((x) => x.sku === code ? { ...x, qty: n } : x) : [...l, { sku: code, description: skuName.get(code) ?? null, qty: n }]);
  };
  const short = tableRows.filter((r) => r.qty > r.rows.length);
  const docForPrint = { ...head, lines: tableRows.map((r) => ({ sku: r.sku, description: r.description, qty: Math.max(r.qty, r.rows.length) })) } as StockDoc;

  if (loading) return <Loading />;
  const needCheck = (cfg.rows[0]?.check_types ?? []).includes(t);
  const postBlocked = needCheck && (!head.checked_at || head.checked_by === profile?.id);
  const wh = (wid: string | null | undefined) => warehouses.find((w) => w.id === wid)?.name ?? "-";
  const showCond = t === "RT" || dir === "in";
  const truck = TRUCK_TYPES.includes(t);
  const route = docRoute({ ...head, warehouse_id: head.warehouse_id ?? "", to_warehouse_id: TO_WH[t] === "none" ? null : head.to_warehouse_id ?? null, partner_name: head.partner_name ?? null }, wh);
  const effect = (t === "BR" || t === "WD") && head.to_warehouse_id
    ? `ย้ายไปคลังปลายทาง สถานะ${t === "BR" ? "ส่งเคลม" : "เบิก / ยืม"}`
    : t === "RV" && !head.to_warehouse_id ? "จองไว้ในคลังต้นทาง" : POST_EFFECT[t];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onClose} className="text-sm font-semibold text-navy-700 hover:underline">← กลับไปรายการเอกสาร</button>
        <h2 className="text-lg font-bold text-navy-900">{DOC_LABEL[t]} {head.doc_no && <span className="font-mono">{head.doc_no}</span>}</h2>
        {head.status && <Badge tone={DOC_STATUS_TONE[head.status]}>{DOC_STATUS_LABEL[head.status]}</Badge>}
        {head.id && (
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            {([["detail", "ใบที่ 1 รายละเอียด"], ["sn", "ใบที่ 2 รายการ SN"]] as const).map(([k, label]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
                <span className="text-xs font-semibold text-navy-900">{label}</span>
                <button className="rounded px-1.5 text-xs font-semibold text-navy-700 hover:bg-slate-100" onClick={() => (k === "detail" ? printDeliveryDetail : printDeliverySns)(docForPrint, items, warehouses)}>PDF</button>
                <button className="rounded px-1.5 text-xs font-semibold text-navy-700 hover:bg-slate-100" onClick={() => run("png", async () => { try { await exportDeliveryPng(docForPrint, items, warehouses, k); } catch (e) { setErr("สร้างรูป PNG ไม่สำเร็จ: " + errorMessage(e)); } })}>PNG</button>
              </span>
            ))}
            <Button variant="secondary" loading={busy === "xlsx"} onClick={() => run("xlsx", async () => { try { await exportDeliveryXlsx(docForPrint, items, warehouses); } catch (e) { setErr(errorMessage(e)); } })}>Excel (2 แผ่น)</Button>
          </div>
        )}
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
              <Select value={t} onChange={(e) => { const nt = e.target.value as DocType; setHead((h) => ({ ...h, doc_type: nt, to_warehouse_id: defaultTo(nt, h.warehouse_id) })); setItems([]); }}>
                {DOC_TYPES.filter((d) => d.type !== "OB" || isAdmin).map((d) => <option key={d.type} value={d.type}>{d.type} · {d.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="วันที่เอกสาร" required>
            <Input type="date" disabled={locked} value={head.doc_date ?? ""} onChange={(e) => set("doc_date", e.target.value)} />
          </Field>
          <div className="rounded-xl bg-navy-50/60 p-3 ring-1 ring-navy-100 sm:col-span-3">
            <p className="text-sm font-semibold text-navy-900">เส้นทางสินค้า</p>
            <div className="mt-2 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <Field label="ต้นทาง" required={route.fromWh} hint={route.fromWh && items.length > 0 && !locked ? "ล้าง SN ก่อนถ้าจะเปลี่ยนคลังต้นทาง" : undefined}>
                {route.fromWh ? (
                  <Select disabled={locked || items.length > 0} value={head.warehouse_id ?? ""} onChange={(e) => {
                    const v = e.target.value;
                    setHead((h) => ({ ...h, warehouse_id: v, ...(h.to_warehouse_id === v ? { to_warehouse_id: defaultTo(t, v) } : {}) }));
                  }}>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                ) : <div className="flex h-10 items-center rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200">{route.from}</div>}
              </Field>
              <span className="hidden pb-2 text-xl font-bold text-navy-700 sm:block" aria-hidden>→</span>
              <Field label="ปลายทาง" required={dir === "in" || TO_WH[t] === "required"}
                hint={t === "RV" ? "SN ที่จองจะย้ายไปคลังนี้ ขายแล้วกดออกใบส่งของ ระบบตัดจากคลังนี้ให้" : TO_WH[t] === "optional" ? "ไม่เลือก = ของออกไปอยู่กับผู้รับ ไม่อยู่คลังใด" : undefined}>
                {dir === "in" ? (
                  <Select disabled={locked} value={head.warehouse_id ?? ""} onChange={(e) => set("warehouse_id", e.target.value)}>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                ) : TO_WH[t] !== "none" ? (
                  <Select disabled={locked} value={head.to_warehouse_id ?? ""} onChange={(e) => set("to_warehouse_id", e.target.value)}>
                    <option value="">{t === "TR" ? "— เลือกคลังปลายทาง —" : t === "RV" ? "— ไม่ย้าย (จองไว้ในคลังต้นทาง) —" : `— ${t === "BR" ? "ส่งเคลมออกไป" : "ออกไปกับผู้เบิก / ผู้ยืม"} (ไม่เข้าคลัง) —`}</option>
                    {warehouses.filter((w) => w.id !== head.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                ) : <div className="flex h-10 items-center rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200">{route.to}</div>}
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {head.status === "posted" ? "อนุมัติแล้ว: " : "เมื่ออนุมัติ: "}SN {items.length} ชิ้น {effect}
              {head.status !== "posted" && <> · ก่อนอนุมัติ สินค้ายังอยู่ที่เดิม</>}
            </p>
          </div>
          {!locked && srcKinds.length > 0 && (
            <div className="sm:col-span-3">
              <Field label="ดึงรายการจากเอกสาร" hint="เลือกแล้วระบบใส่ลูกค้าและรายการสินค้าให้ แล้วเลือก SN ของแต่ละรายการ (ใบจองในคลังดึง SN ที่จองไว้มาให้เลย)">
                <div className="flex flex-wrap gap-2">
                  <Select className="max-w-[14rem]" value={srcKind} onChange={(e) => setSrcKind(e.target.value as SourceKind | "")}>
                    <option value="">— ไม่ดึง —</option>
                    {srcKinds.map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}
                  </Select>
                  {srcKind && (
                    <Select className="min-w-[16rem] flex-1" value="" onChange={(e) => pullSource(srcKind, e.target.value)}>
                      <option value="">{srcOpts.length ? `— เลือก${SOURCE_LABEL[srcKind]} —` : "กำลังโหลด / ไม่มีเอกสาร"}</option>
                      {srcOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </Select>
                  )}
                </div>
              </Field>
            </div>
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
            <Field label="ชื่อโครงการ / สถานที่ใช้งาน">
              <Input disabled={locked} value={head.site_name ?? ""} onChange={(e) => set("site_name", e.target.value)} />
            </Field>
          )}
          {["WD", "RV"].includes(t) && (
            <Field label={t === "RV" ? "จองถึงวันที่" : "กำหนดคืน"}>
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
          {truck && (
            <div className="grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:col-span-3 sm:grid-cols-3">
              <p className="text-sm font-semibold text-navy-900 sm:col-span-3">{dir === "in" ? "รถที่มาส่งสินค้า" : "รถที่ไปส่งสินค้า"}</p>
              <Field label="ทะเบียนรถ">
                <Input disabled={locked} value={head.vehicle_plate ?? ""} onChange={(e) => set("vehicle_plate", e.target.value)} placeholder="เช่น 1กข 1234 กรุงเทพฯ" />
              </Field>
              <Field label="ชื่อคนขับ">
                <Input disabled={locked} value={head.driver_name ?? ""} onChange={(e) => set("driver_name", e.target.value)} />
              </Field>
              <Field label="เบอร์โทรคนขับ">
                <Input disabled={locked} type="tel" inputMode="tel" value={head.driver_phone ?? ""} onChange={(e) => set("driver_phone", e.target.value)} />
              </Field>
              <p className="text-xs text-slate-500 sm:col-span-3">แนบรูปทะเบียนรถ เอกสารรถ เอกสารคนขับ และรูปสินค้าบนรถได้ในกล่องรูปด้านล่าง</p>
            </div>
          )}
          <div className="sm:col-span-3">
            <Field label="หมายเหตุ">
              <Input disabled={locked} value={head.note ?? ""} onChange={(e) => set("note", e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      {(t === "SO" || t === "WD") && fromRv && (
        <Alert tone="navy">
          {DOC_LABEL[t]}นี้ออกจากใบจอง{" "}
          {onOpen ? <button onClick={() => onOpen(fromRv.id)} className="font-mono font-semibold underline">{fromRv.doc_no}</button> : <b className="font-mono">{fromRv.doc_no}</b>}
          {" "}· ตัดสต๊อกจาก {wh(head.warehouse_id)} · ใส่ข้อมูลรถ/คนขับ แนบรูป แล้วกดยืนยัน
        </Alert>
      )}
      {claim && (
        <Alert tone="navy">
          จากงานเคลม <b>{claim.claim_no}</b> · {claim.company_name ?? claim.contact_name} · SN ที่แจ้ง: <span className="font-mono">{claim.reported_sns.join(", ") || "-"}</span>
          {t === "RT" ? " · ระบบใส่ SN ที่แจ้งเป็นสภาพเสียให้แล้ว (SN ที่ไม่เคยขายจากระบบจะไม่ถูกเพิ่ม)" : " · สแกน SN ตัวใหม่ที่ส่งเปลี่ยนให้ลูกค้า"}
        </Alert>
      )}
      {plan && (
        <Alert tone="navy">
          <p className="font-semibold">ตาม{SOURCE_LABEL[plan.kind]} {plan.code}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {plan.lines.map((i) => {
              const n = items.filter((x) => x.sku === i.sku).length;
              return (
                <span key={i.sku} className="inline-flex items-center gap-2 rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
                  <span title={i.label}>{i.sku} × {i.qty}</span>
                  <b className={n === i.qty ? "text-emerald-700" : "text-amber-700"}>(ใส่ SN แล้ว {n})</b>
                  {!locked && dir !== "in" && n < i.qty && <button className="text-xs font-semibold text-navy-700 underline" onClick={() => { setPickSku(i.sku); pickRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>เลือก SN</button>}
                </span>
              );
            })}
          </div>
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
              {dir !== "in" && <p className="text-xs text-slate-500">สแกน / พิมพ์ SN ได้เลย ระบบดึงรหัสสินค้าให้เอง หรือเลือกสินค้าจากฐานข้อมูลด้านล่างแล้วติ๊ก SN</p>}
            </div>
            <div>
              <textarea ref={scanRef} rows={3} value={scan} onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addSns(scan); } }}
                placeholder="สแกนบาร์โค้ด SN (กด Enter ทีละตัว) หรือวางหลายตัวจาก Excel แล้วกด เพิ่ม"
                className="block w-full rounded-lg border-0 bg-white px-3 py-2.5 font-mono text-sm shadow-sm ring-1 ring-inset ring-slate-300 placeholder:font-sans placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-navy-600" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => addSns(scan)}>+ เพิ่ม SN</Button>
                <CameraScan onScan={(sns) => addSns(sns.join("\n"))} last={items.length ? { text: `${items.length} SN · ล่าสุด ${items[items.length - 1].sn}`, tone: "green" } : null} />
                <PhotoScan knownSkus={new Set(stock.rows.map((r) => r.sku))} existing={new Set(items.map((i) => snKey(i.sn)))} onAdd={(sns, photos) => { addSns(sns.join("\n")); if (photos.length) setPendingFiles((p) => [...p, ...photos.map((file) => ({ file, kind: "other" as const }))]); }} />
                <span className="text-xs text-slate-500">แยกด้วยบรรทัดใหม่ เครื่องหมาย , หรือแท็บ</span>
              </div>
            </div>
          </div>
        )}
        {!locked && dir !== "in" && (
          <div ref={pickRef} className="mt-3">
            <SnPicker type={t} warehouseId={head.warehouse_id} sku={pickSku} setSku={setPickSku} skus={stock.rows}
              want={(() => { const l = plan?.lines.find((x) => x.sku === pickSku.trim().toUpperCase()); return l ? Math.max(0, l.qty - items.filter((x) => x.sku === l.sku).length) : undefined; })()}
              existing={new Set(items.map((i) => snKey(i.sn)))} onAdd={(add) => { setItems((l) => uniq(l, add)); setWarn([]); }} />
          </div>
        )}
        {warn.length > 0 && <div className="mt-3"><Alert tone="amber">{warn.map((w, i) => <div key={i}>{w}</div>)}</Alert></div>}

        <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2 text-center">#</th>
                <th className="px-3 py-2">รหัสสินค้า</th>
                <th className="px-3 py-2">ชื่อสินค้า</th>
                <th className="px-3 py-2">Serial Number</th>
                <th className="px-3 py-2 text-right">จำนวน</th>
                {!locked && <th className="w-10 px-2 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {tableRows.map((g, gi) => {
                return (
                  <tr key={g.sku}>
                    <td className="px-3 py-2 text-center text-slate-400">{gi + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-navy-900">{g.sku}</td>
                    <td className="min-w-[10rem] px-3 py-2">
                      <p>{g.description ?? skuName.get(g.sku) ?? "-"}</p>
                      <div className="mt-1">{t === "SO" && (() => {
                  const def = defMonths.get(g.sku.toUpperCase()) ?? null;
                  const cur = groupWarranty.get(g.sku);
                  const promo = cur != null && def != null && cur !== def;
                  return locked ? (
                    <p className="flex items-center gap-2 text-xs text-slate-600">
                      ประกัน <span className={cx("font-semibold", promo ? "text-amber-700" : "text-navy-900")}>{cur != null ? fmtWarranty(cur) : def != null ? fmtWarranty(def) : "ยังไม่ตั้ง"}</span>
                      {promo && <Badge tone="amber">ปกติ {fmtWarranty(def)}</Badge>}
                      {canPost && head.status === "posted" && <button onClick={() => fixPostedWarranty(g.sku)} className="text-navy-700 underline">แก้</button>}
                    </p>
                  ) : (
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      ประกันในบิลนี้
                      <input type="number" min={0} max={600} inputMode="numeric" value={cur ?? ""} placeholder={def != null ? String(def) : "-"}
                        onChange={(e) => setGroupWarranty(g.sku, e.target.value)}
                        className={cx("h-8 w-20 rounded-lg border px-2 text-right text-sm", promo ? "border-amber-400 bg-amber-50" : "border-slate-300")} />
                      เดือน
                      {promo ? <Badge tone="amber">ปกติ {fmtWarranty(def)}</Badge> : <span className="text-slate-400">{def != null ? `ว่าง = ตามสินค้า ${fmtWarranty(def)}` : "สินค้ายังไม่ตั้งประกัน"}</span>}
                    </label>
                  );
                })()}</div>
                    </td>
                    <td className="min-w-[18rem] px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {g.rows.map(({ item, idx }) => (
                          <span key={item.sn} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-200">
                            <span className="font-mono text-xs">{item.sn}</span>
                            {showCond ? (
                              locked ? (item.condition === "defective" && <Badge tone="red">{CONDITION_LABEL[item.condition]}</Badge>) : (
                                <select value={item.condition} onChange={(e) => setItems((l) => l.map((x, i) => i === idx ? { ...x, condition: e.target.value as Condition } : x))}
                                  className={cx("rounded border-0 bg-transparent py-0 text-[11px]", item.condition === "good" ? "text-emerald-700" : "text-red-700")}>
                                  <option value="good">ดี</option><option value="defective">เสีย</option>
                                </select>
                              )
                            ) : null}
                            {!locked && <button onClick={() => setItems((l) => l.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600" aria-label="ลบ SN">✕</button>}
                          </span>
                        ))}
                      </div>
                      {!locked && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <input placeholder="+ พิมพ์ / สแกน SN แล้ว Enter" className="h-8 w-48 rounded-md border border-slate-300 px-2 font-mono text-xs"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value; (e.target as HTMLInputElement).value = ""; addSns(v, cond, g.sku); } }}
                            onPaste={(e) => { const v = e.clipboardData.getData("text"); if (/[\n,;\t]/.test(v)) { e.preventDefault(); addSns(v, cond, g.sku); } }} />
                          {dir !== "in" && <button className="text-xs font-semibold text-navy-700 underline" onClick={() => { setPickSku(g.sku); pickRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>เลือก SN จากคลัง</button>}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {locked ? <span className="font-semibold">{Math.max(g.qty, g.rows.length)}</span> : (
                        <input type="number" min={0} inputMode="numeric" value={g.qty} onChange={(e) => setLineQty(g.sku, e.target.value)}
                          className="h-8 w-20 rounded-md border border-slate-300 px-2 text-right text-sm" aria-label="จำนวน" />
                      )}
                      <p className={cx("mt-1 text-xs font-semibold", g.rows.length >= g.qty ? "text-emerald-700" : "text-amber-700")}>SN {g.rows.length}/{Math.max(g.qty, g.rows.length)}</p>
                    </td>
                    {!locked && (
                      <td className="px-2 py-2 text-center">
                        <button title="ลบสินค้านี้" className="text-slate-400 hover:text-red-600"
                          onClick={() => { setItems((l) => l.filter((x) => x.sku !== g.sku)); setDocLines((l) => l.filter((x) => x.sku !== g.sku)); }}>🗑</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!tableRows.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">ยังไม่มีสินค้า เพิ่มสินค้าด้านล่าง หรือสแกน SN ด้านบน</td></tr>}
            </tbody>
            <tfoot className="bg-slate-50 text-sm">
              {!locked && (
                <tr>
                  <td />
                  <td colSpan={3} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProductSearch className="w-full max-w-md" products={stock.rows} value={addSku} onChange={setAddSku} onPick={(k) => addProduct(k)} placeholder="+ เพิ่มสินค้า: พิมพ์หรือเลือกรหัส / ชื่อสินค้า" />
                      <Button variant="secondary" onClick={() => addProduct()} disabled={!addSku.trim()}>เพิ่มสินค้า</Button>
                    </div>
                  </td>
                  <td colSpan={2} />
                </tr>
              )}
              <tr className="font-semibold">
                <td colSpan={4} className="px-3 py-2 text-right">รวม {tableRows.length} รายการ</td>
                <td className="px-3 py-2 text-right">{tableRows.reduce((a, r) => a + Math.max(r.qty, r.rows.length), 0)} <span className="text-xs font-normal text-slate-500">(SN {items.length})</span></td>
                {!locked && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card>
        <DocFiles docId={head.id ?? null} draft={!locked} pending={pendingFiles} setPending={setPendingFiles} tick={fileTick} kinds={truck} />
        {head.id && pendingFiles.length > 0 && <p className="mt-2 text-xs text-amber-700">มีรูปรออัปโหลด {pendingFiles.length} ไฟล์ กดบันทึกร่างหรือยืนยันเพื่ออัปโหลด</p>}
      </Card>

      {head.status !== "cancelled" && (
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {[
            { label: "บันทึกข้อมูล", done: !!head.id, at: head.created_at },
            ...(needCheck ? [{ label: "ตรวจสอบ (ชั้นที่ 1)", done: !!head.checked_at, at: head.checked_at }] : []),
            { label: `อนุมัติ${needCheck ? " (ชั้นที่ 2)" : ""} = ย้ายสต๊อก`, done: head.status === "posted", at: head.posted_at },
          ].map((s, i, a) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={cx("rounded-full px-2.5 py-1 font-semibold ring-1", s.done ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-slate-500 ring-slate-200")}>
                {s.done ? "✓" : i + 1}. {s.label}{s.done && s.at ? ` · ${formatDateTime(s.at)}` : ""}
              </span>
              {i < a.length - 1 && <span className="text-slate-400">→</span>}
            </li>
          ))}
        </ol>
      )}
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
        {head.status === "posted" && t === "RV" && (canSave || canPost) && <Button onClick={onSold} loading={busy === "sold"}>ขายแล้ว → ออกใบส่งของ</Button>}
        {head.status === "posted" && <span className="self-center text-xs text-slate-500">{route.from} → {route.to}</span>}
      </div>
    </div>
  );
}
