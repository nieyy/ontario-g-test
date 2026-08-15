import { centres } from '../src/content/data'
import { guidancePlans } from '../src/content/guidance'
import { validateCentreContent, validateGuidanceContent } from '../src/content/validate'

const errors = centres.flatMap((centre) =>
  [...validateCentreContent(centre), ...validateGuidanceContent(centre, guidancePlans)]
    .map((error) => `${centre.id}: ${error}`),
)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`Validated ${centres.length} centre, six scenario families, and ${guidancePlans.length} guidance plans.`)
