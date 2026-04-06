import { Activity, AlertCircle, CheckCircle } from 'lucide-react';

interface PatientListItemProps {
  name: string;
  status: 'stable' | 'critical' | 'recovered';
  room: string;
  lastCheckup: string;
}

export function PatientListItem({ name, status, room, lastCheckup }: PatientListItemProps) {
  const statusConfig = {
    stable: {
      color: 'text-blue-600 bg-blue-50',
      icon: <Activity className="w-4 h-4" />,
      label: 'Stable'
    },
    critical: {
      color: 'text-red-600 bg-red-50',
      icon: <AlertCircle className="w-4 h-4" />,
      label: 'Critical'
    },
    recovered: {
      color: 'text-green-600 bg-green-50',
      icon: <CheckCircle className="w-4 h-4" />,
      label: 'Recovered'
    }
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-accent rounded-lg transition-colors cursor-pointer">
      <div className="flex-1">
        <h4 className="mb-1">{name}</h4>
        <p className="text-sm text-muted-foreground">Room {room}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Last checkup</p>
          <p className="text-sm">{lastCheckup}</p>
        </div>
        <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${config.color}`}>
          {config.icon}
          <span className="text-sm">{config.label}</span>
        </div>
      </div>
    </div>
  );
}
