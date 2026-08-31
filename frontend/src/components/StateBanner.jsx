import { Flash, Heading, Spinner, Text } from '@primer/react'
import { AlertIcon, RepoIcon } from '@primer/octicons-react'

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state-center">
      <Spinner size="medium" />
      <span className="muted">{label}</span>
    </div>
  )
}

export function ErrorState({ message }) {
  return (
    <Flash variant="danger" className="state-flash">
      <AlertIcon /> {message || 'Something went wrong.'}
    </Flash>
  )
}

export function EmptyState({
  title = 'Nothing here yet',
  description = 'Ingest repositories or load the demo seed to populate this view.',
  icon: Icon = RepoIcon,
}) {
  return (
    <div className="empty-slate">
      <div className="empty-slate-icon">
        <Icon size={24} />
      </div>
      <Heading as="h3" className="h3">{title}</Heading>
      <Text as="p" className="muted">{description}</Text>
    </div>
  )
}
