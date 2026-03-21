import LegalDocumentPage from '../components/legal/LegalDocumentPage'
import { privacyPolicyDocument } from '../data/legalDocuments'

export default function PrivacyPolicyPage() {
  return <LegalDocumentPage document={privacyPolicyDocument} />
}
