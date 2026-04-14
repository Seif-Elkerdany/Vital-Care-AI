import { Clock, Video, MapPin } from 'lucide-react';

interface AppointmentCardProps {
  patientName: string;
  time: string;
  type: 'video' | 'in-person';
  condition: string;
  avatar: string;
}

export function AppointmentCard({ patientName, time, type, condition, avatar }: AppointmentCardProps) {
  return (
    <div className="bg-white rounded-lg p-4 border border-border hover:border-primary/30 transition-colors cursor-pointer">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span>{avatar}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="mb-1">{patientName}</h4>
          <p className="text-muted-foreground text-sm mb-2">{condition}</p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{time}</span>
            </div>
            <div className="flex items-center gap-1">
              {type === 'video' ? (
                <>
                  <Video className="w-4 h-4" />
                  <span>Video call</span>
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4" />
                  <span>Room 204</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
