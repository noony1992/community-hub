import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BanAppealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string | null;
  onSubmitted?: () => void;
}

const BanAppealDialog = ({ open, onOpenChange, serverId, onSubmitted }: BanAppealDialogProps) => {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!serverId || !user?.id) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Appeal reason is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error: appealError } = await supabase.from("moderation_appeals").insert({
      server_id: serverId,
      user_id: user.id,
      punishment_type: "ban",
      reason: trimmedReason,
    });
    setSubmitting(false);

    if (appealError) {
      setError(`Failed to submit appeal: ${appealError.message}`);
      return;
    }

    setReason("");
    onOpenChange(false);
    onSubmitted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Ban Appeal</DialogTitle>
          <DialogDescription>
            You are currently banned from this server. Share context for moderator review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why should this ban be reconsidered?"
            rows={5}
            disabled={submitting}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !reason.trim()}>
            {submitting ? "Submitting..." : "Submit Appeal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BanAppealDialog;
