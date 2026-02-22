import { Headphones, Mic } from "lucide-react";
import { useVoiceContext } from "@/context/VoiceContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type VoiceSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const VoiceSettingsDialog = ({ open, onOpenChange }: VoiceSettingsDialogProps) => {
  const {
    headphoneVolume,
    microphoneLevel,
    cameraQuality,
    screenQuality,
    setHeadphoneVolume,
    setMicrophoneLevel,
    setCameraQuality,
    setScreenQuality,
  } = useVoiceContext();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Voice and Stream Settings</DialogTitle>
          <DialogDescription>
            Configure audio levels and camera/screen streaming quality.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Headphones className="w-4 h-4" />
                Headphones volume
              </span>
              <span className="text-muted-foreground">{headphoneVolume}%</span>
            </div>
            <Slider
              value={[headphoneVolume]}
              min={0}
              max={100}
              step={1}
              onValueChange={(values) => setHeadphoneVolume(values[0] ?? headphoneVolume)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Mic className="w-4 h-4" />
                Microphone level
              </span>
              <span className="text-muted-foreground">{microphoneLevel}%</span>
            </div>
            <Slider
              value={[microphoneLevel]}
              min={0}
              max={200}
              step={1}
              onValueChange={(values) => setMicrophoneLevel(values[0] ?? microphoneLevel)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-foreground">Camera streaming quality</p>
            <Select value={cameraQuality} onValueChange={(value) => setCameraQuality(value as "low" | "balanced" | "high")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low (360p, 15fps)</SelectItem>
                <SelectItem value="balanced">Balanced (720p, 24fps)</SelectItem>
                <SelectItem value="high">High (1080p, 30fps)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-foreground">Screen share quality</p>
            <Select value={screenQuality} onValueChange={(value) => setScreenQuality(value as "low" | "balanced" | "high")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low (720p, 10fps)</SelectItem>
                <SelectItem value="balanced">Balanced (1080p, 20fps)</SelectItem>
                <SelectItem value="high">High (1440p, 30fps)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceSettingsDialog;
