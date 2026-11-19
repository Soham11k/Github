import { Heading, Text } from '@primer/react'
import { APP_DISCLAIMER, APP_NAME } from '../brand'
import { usePageTitle } from '../lib/pageTitle'

export default function Terms() {
  usePageTitle('Terms')
  return (
    <div className="page prose-page">
      <Heading as="h1">Terms</Heading>
      <Text as="p">
        {APP_NAME} is provided as-is for education and exploration of public open-source signals.
        Do not rely on health scores as legal, security, or investment advice.
      </Text>
      <Text as="p">{APP_DISCLAIMER}</Text>
      <Text as="p">
        Use of GitHub data must comply with GitHub&apos;s Terms of Service and API Acceptable Use.
        Abuse of ingest requests or automated scraping beyond the product&apos;s rate limits may
        result in account or IP blocks.
      </Text>
    </div>
  )
}
