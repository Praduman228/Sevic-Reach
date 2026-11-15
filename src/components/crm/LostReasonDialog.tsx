import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LostReasonDialog({ firmName, onCancel, onConfirm }: { firmName: string | null; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={!!firmName} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Why was {firmName} lost?</DialogTitle></DialogHeader>
        <Input autoFocus maxLength={300} placeholder="e.g. Chose a competitor" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); setReason(""); }}>Mark lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
