import { Heart, Activity, Thermometer, Wind } from 'lucide-react';

interface Vital {
  label: string;
  value: string;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  icon: React.ReactNode;
}

interface VitalsMonitorProps {
  vitals: {
    heartRate: number;
    bloodPressure: string;
    temperature: number;
    oxygenSaturation: number;
    respiratoryRate: number;
  };
}

export function VitalsMonitor({ vitals }: VitalsMonitorProps) {
  const vitalsSigns: Vital[] = [
    {
      label: 'Heart Rate',
      value: vitals.heartRate.toString(),
      unit: 'bpm',
      status: vitals.heartRate > 100 ? 'warning' : 'normal',
      icon: <Heart className="w-5 h-5" />
    },
    {
      label: 'Blood Pressure',
      value: vitals.bloodPressure,
      unit: 'mmHg',
      status: 'normal',
      icon: <Activity className="w-5 h-5" />
    },
    {
      label: 'Temperature',
      value: vitals.temperature.toFixed(1),
      unit: '°F',
      status: vitals.temperature > 100.4 ? 'warning' : 'normal',
      icon: <Thermometer className="w-5 h-5" />
    },
    {
      label: 'O₂ Saturation',
      value: vitals.oxygenSaturation.toString(),
      unit: '%',
      status: vitals.oxygenSaturation < 95 ? 'critical' : 'normal',
      icon: <Wind className="w-5 h-5" />
    },
    {
      label: 'Resp. Rate',
      value: vitals.respiratoryRate.toString(),
      unit: '/min',
      status: 'normal',
      icon: <Activity className="w-5 h-5" />
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'bg-red-100 border-red-500 text-red-700';
      case 'warning':
        return 'bg-yellow-100 border-yellow-500 text-yellow-700';
      default:
        return 'bg-green-100 border-green-500 text-green-700';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-border p-6">
      <h2 className="mb-4">Vital Signs</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vitalsSigns.map((vital, index) => (
          <div
            key={index}
            className={`rounded-lg p-4 border-2 ${getStatusColor(vital.status)}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {vital.icon}
              <span className="text-sm">{vital.label}</span>
            </div>
            <p className="text-2xl mb-1">
              {vital.value} <span className="text-sm">{vital.unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
