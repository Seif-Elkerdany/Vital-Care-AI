import { Bell, User } from 'lucide-react';

export function DashboardHeader() {
  return (
    <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
      <div>
        <h1>Good morning, Dr. Sarah</h1>
        <p className="text-muted-foreground">Here's what's happening today</p>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative p-2 hover:bg-accent rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
        </button>
        <button className="flex items-center gap-3 p-2 hover:bg-accent rounded-lg transition-colors">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
        </button>
      </div>
    </header>
  );
}
