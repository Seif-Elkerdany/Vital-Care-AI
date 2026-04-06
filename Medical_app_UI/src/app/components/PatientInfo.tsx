import { User, Calendar, Ruler, Weight, Activity } from 'lucide-react';

interface PatientInfoProps {
  name: string;
  age: number;
  gender: string;
  height: string;
  weight: string;
  bloodType: string;
  conditions: string[];
}

export function PatientInfo({ name, age, gender, height, weight, bloodType, conditions }: PatientInfoProps) {
  return (
    <div className="bg-white rounded-lg border border-border p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
          <User className="w-10 h-10 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="mb-1">{name}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{age} years old</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>{gender}</span>
            </div>
            <div className="flex items-center gap-1">
              <Activity className="w-4 h-4" />
              <span>Type {bloodType}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-accent/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Ruler className="w-4 h-4" />
            <span className="text-sm">Height</span>
          </div>
          <p className="text-xl">{height}</p>
        </div>
        <div className="bg-accent/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Weight className="w-4 h-4" />
            <span className="text-sm">Weight</span>
          </div>
          <p className="text-xl">{weight}</p>
        </div>
      </div>

      {conditions.length > 0 && (
        <div>
          <h3 className="mb-3">Current Conditions</h3>
          <div className="space-y-2">
            {conditions.map((condition, index) => (
              <div
                key={index}
                className={`px-4 py-3 rounded-lg border-l-4 ${
                  condition.toLowerCase().includes('sepsis') || condition.toLowerCase().includes('critical')
                    ? 'bg-red-50 border-red-500'
                    : 'bg-blue-50 border-blue-500'
                }`}
              >
                <p className="text-sm">{condition}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
