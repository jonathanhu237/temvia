import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PreferencesButtons } from './preferences-menu'

export function AuthPage({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h1>
            </CardTitle>
            {description && <CardDescription className="mt-3 max-w-[38ch] text-base leading-relaxed">{description}</CardDescription>}
          </div>
          <PreferencesButtons className="shrink-0" />
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}

export function AuthAlert({ title, description }: { title: string; description: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}
