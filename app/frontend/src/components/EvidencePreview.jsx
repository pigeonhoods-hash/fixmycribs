import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

/** Private evidence is fetched through the authenticated API, not an unprotected URL. */
export default function EvidencePreview({ files = [], title = "Evidence" }) {
  const [active, setActive] = useState(null);
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active?.id) return undefined;
    let cancelled = false;
    let objectUrl = null;
    setLoading(true);
    setError("");
    setUrl(null);
    api.get(`/evidence/${encodeURIComponent(active.id)}`, { responseType: "blob" })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.status === 403 ? "You don't have permission to view this evidence." : "Unable to load evidence. Try again.");
          toast.error("Unable to load evidence");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [active?.id]);
  const items = files.filter(f => f && f.id);
  if (!items.length) return null;
  const mime = active?.content_type || "";
  const close = () => { setActive(null); setUrl(null); setError(""); };
  return (
    <div className="space-y-2" data-testid="landlord-evidence">
      <div className="text-sm font-semibold">{title} ({items.length})</div>
      <div className="flex flex-wrap gap-2">
        {items.map((f, i) => <Button key={f.id} size="sm" variant="outline" onClick={() => setActive(f)} data-testid={`view-evidence-${i}`}>
          View {f.content_type?.startsWith("image/") ? "photo" : f.content_type?.startsWith("video/") ? "video" : "file"}: {f.name || `Attachment ${i + 1}`}
        </Button>)}
      </div>
      <Dialog open={!!active} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{active?.name || title}</DialogTitle></DialogHeader>
          {loading && <p className="text-sm text-slate-500">Loading evidence...</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {url && (mime.startsWith("image/") ? <img src={url} alt={active?.name || "Uploaded evidence"} className="max-h-[70vh] w-full object-contain" />
            : mime.startsWith("video/") ? <video controls playsInline src={url} className="w-full max-h-[70vh]" />
            : mime === "application/pdf" ? <iframe title={active?.name || "Evidence PDF"} src={url} className="w-full h-[65vh]" />
            : <p className="text-sm">Preview unavailable for this file type.</p>)}
          {url && <a href={url} download={active?.name || "evidence"} className="text-sm text-blue-600 underline">Download evidence</a>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
