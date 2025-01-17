import {
  addComponentInterfaceToExportedObject,
  createDefaultExportFromLegacySyntax,
  extendTagProperty,
  filterNonExportDefaultStatements, findAllExportNamedDeclarations,
  findAllImportDeclarations, findComponentInterface,
  findExportDefaultStatement,
  getProgramBody
} from './utils'
import addLinesOffset from '../../utils/add-lines-offset'
import generateAST from '../../utils/generate-ast'
import getPreprocessorTypeByAttribute from '../../utils/get-preprocessor-type-by-attribute'
import isEmptySourcemap from '../../utils/is-empty-sourcemap'
import {isNil} from '@riotjs/util/checks'
import {isThisExpressionStatement} from '../../utils/ast-nodes-checks'
import preprocess from '../../utils/preprocess-node'
import sourcemapToJSON from '../../utils/sourcemap-as-json'

/**
 * Generate the component javascript logic
 * @param   { Object } sourceNode - node generated by the riot compiler
 * @param   { string } source - original component source code
 * @param   { Object } meta - compilation meta information
 * @param   { AST } ast - current AST output
 * @returns { AST } the AST generated
 */
export default function javascript(sourceNode, source, meta, ast) {
  const preprocessorName = getPreprocessorTypeByAttribute(sourceNode)
  const javascriptNode = addLinesOffset(sourceNode.text.text, source, sourceNode)
  const { options } = meta
  const preprocessorOutput = preprocess('javascript', preprocessorName, meta, {
    ...sourceNode,
    text: javascriptNode
  })
  const inputSourceMap = sourcemapToJSON(preprocessorOutput.map)
  const generatedAst = generateAST(preprocessorOutput.code, {
    sourceFileName: options.file,
    inputSourceMap: isEmptySourcemap(inputSourceMap) ? null : inputSourceMap
  })
  const generatedAstBody = getProgramBody(generatedAst)
  const exportDefaultNode = findExportDefaultStatement(generatedAstBody)
  const isLegacyRiotSyntax = isNil(exportDefaultNode)
  const outputBody = getProgramBody(ast)
  const componentInterface = findComponentInterface(generatedAstBody)

  // throw in case of mixed component exports
  if (exportDefaultNode && generatedAstBody.some(isThisExpressionStatement))
    throw new Error('You can\t use "export default {}" and root this statements in the same component')

  // add to the ast the "private" javascript content of our tag script node
  outputBody.unshift(
    ...(
      // for the legacy riot syntax we need to move all the import and (named) export statements outside of the function body
      isLegacyRiotSyntax ?
        [...findAllImportDeclarations(generatedAstBody), ...findAllExportNamedDeclarations(generatedAstBody)] :
        // modern riot syntax will hoist all the private stuff outside of the export default statement
        filterNonExportDefaultStatements(generatedAstBody)
    ))

  // create the public component export properties from the root this statements
  if (isLegacyRiotSyntax) extendTagProperty(
    ast,
    createDefaultExportFromLegacySyntax(generatedAstBody)
  )

  // convert the export default adding its content to the component property exported
  if (exportDefaultNode) extendTagProperty(ast, exportDefaultNode)

  return componentInterface ?
    // add the component interface to the component object exported
    addComponentInterfaceToExportedObject(ast, componentInterface) :
    ast
}
