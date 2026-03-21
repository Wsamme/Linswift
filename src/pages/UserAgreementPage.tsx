import LegalDocumentPage from '../components/legal/LegalDocumentPage'
import { userAgreementDocument } from '../data/legalDocuments'

export default function UserAgreementPage() {
  return <LegalDocumentPage document={userAgreementDocument} />
}
