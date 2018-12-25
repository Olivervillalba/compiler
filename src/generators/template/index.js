import {BINDING_TYPES, COMPONENTS_REGISTRY, EXPRESSION_TYPES, TEMPLATE_FN} from './constants'
import {builders, types} from '../../utils/build-types'
import build from './builder'
import {callTemplateFunction} from './utils'
import recast from 'recast'

/**
 * Extend the AST adding the new template property containing our template call to render the component
 * @param   { Object } ast - current output ast
* @param   { stiring } sourceFile - source file path
 * @param   { string } sourceCode - original source
 * @param   { Object } sourceNode - node generated by the riot compiler
 * @returns { Object } the output ast having the "template" key
 */
function extendTemplateProperty(ast, sourceFile, sourceCode, sourceNode) {
  types.visit(ast, {
    visitProperty(path) {
      if (path.value.key.name === 'template') {
        path.value.value = builders.functionExpression(
          null,
          [
            TEMPLATE_FN,
            EXPRESSION_TYPES,
            BINDING_TYPES,
            COMPONENTS_REGISTRY
          ].map(builders.identifier),
          builders.blockStatement([
            builders.returnStatement(
              callTemplateFunction(...build(sourceNode, sourceCode, sourceNode))
            )
          ])
        )

        return false
      }

      this.traverse(path)
    }
  })

  return ast
}

/**
 * Generate the component template logic
 * @param   { Object } sourceNode - node generated by the riot compiler
 * @param   { string } source - original component source code
 * @param   { Object } options - user options
 * @param   { Output } output - current compiler output
 * @returns { Promise<Output> } - enhanced output with the result of the current generator
 */
export default async function template(sourceNode, source, options, { ast, map }) {
  const output = extendTemplateProperty(ast, options.file, source, sourceNode)

  return { ast: output, map, code: recast.print(output).code }
}