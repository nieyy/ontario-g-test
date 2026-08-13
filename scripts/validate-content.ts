import { centres } from '../src/content/data'
import { validateCentreContent } from '../src/content/validate'

const errors = centres.flatMap((centre) =>
  validateCentreContent(centre).map((error) => `${centre.id}: ${error}`),
)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`Validated ${centres.length} centre and six scenario families.`)
