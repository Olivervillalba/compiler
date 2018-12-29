import {
  BINDING_ATTRIBUTES_KEY,
  BINDING_BINDINGS_KEY,
  BINDING_CONDITION_KEY,
  BINDING_EVALUATE_KEY,
  BINDING_EXPRESSIONS_KEY,
  BINDING_GET_KEY_KEY,
  BINDING_HTML_KEY,
  BINDING_ID_KEY,
  BINDING_INDEX_NAME_KEY,
  BINDING_NAME_KEY,
  BINDING_SELECTOR_KEY,
  BINDING_TEMPLATE_KEY,
  BINDING_TYPE_KEY
} from '../../src/generators/template/constants'
import {bindingTypes, expressionTypes} from '@riotjs/dom-bindings'
import {evaluateScript, renderExpression} from '../helpers'
import {mergeNodeExpressions, toScopedFunction} from '../../src/generators/template/utils'
import builder from '../../src/generators/template/builder'
import compose from '../../src/utils/compose'
import curry from 'curri'
import eachBinding from '../../src/generators/template/bindings/each'
import {expect} from 'chai'
import ifBinding from '../../src/generators/template/bindings/if'
import recast from 'recast'
import riotParser from '@riotjs/parser'
import simpleBinding from '../../src/generators/template/bindings/simple'
import tagBinding from '../../src/generators/template/bindings/tag'

const FAKE_SRC_FILE = 'fake-file.js'
const renderExpr = compose(
  renderExpression,
  toScopedFunction,
  expr => ({ text: expr })
)

const getSlotById = (slots, id) => slots.find(slot => slot[BINDING_ID_KEY] === id)

const removeIdFromExpessionBindings = str => str.replace(/expr(\d+)/g, 'expr')
const buildSimpleTemplate = compose(removeIdFromExpessionBindings, res => res[0], builder)

const evaluateOutput = (ast, components = {}) => evaluateScript(`
  import { bindingTypes, expressionTypes, template } from '@riotjs/dom-bindings'

  export default function output(components) {
    return ${recast.print(ast).code}
  }
`).default(components)
const parse = (input, options) => riotParser(options).parse(input).output

describe('Generators - Template', () => {
  describe('Utils', () => {
    describe('Expressions rendering', () => {
      it('simple', () => {
        expect(renderExpr('foo')).to.be.equal('scope.foo')
      })

      it('throw in case of missing expression', () => {
        expect(() => renderExpr('')).to.throw
      })

      it('primitves', () => {
        expect(renderExpr('true')).to.be.equal('true')
        expect(renderExpr('1 > 2')).to.be.equal('1 > 2')
        expect(renderExpr('null')).to.be.equal('null')
        expect(renderExpr('\'hello\'')).to.be.equal('\'hello\'')
        expect(renderExpr('undefined')).to.be.equal('undefined')
        expect(renderExpr('RegExp')).to.be.equal('RegExp')
        expect(renderExpr('Number')).to.be.equal('Number')
        expect(renderExpr('Boolean')).to.be.equal('Boolean')
      })

      it('simple sum', () => {
        expect(renderExpr('foo + bar')).to.be.equal('scope.foo + scope.bar')
      })

      it('context transform', () => {
        expect(renderExpr('this.foo + this.bar')).to.be.equal('scope.foo + scope.bar')
        expect(renderExpr('this + this')).to.be.equal('scope + scope')
      })

      it('objects', () => {
        expect(renderExpr('{ foo: bar, buz: baz }')).to.be.equal('{ foo: scope.bar, buz: scope.baz }')
        expect(renderExpr('{ foo: { foo: bar, buz: baz }, buz: baz }')).to.be.equal('{ foo: { foo: scope.bar, buz: scope.baz }, buz: scope.baz }')
      })

      it('arrays', () => {
        expect(renderExpr('[foo, \'bar\', baz]')).to.be.equal('[scope.foo, \'bar\', scope.baz]')
      })

      it('classes declaration', () => {
        expect(renderExpr('class Foo {}')).to.be.equal('class Foo {}')
        expect(renderExpr('class Foo extends Bar {}')).to.be.equal('class Foo extends Bar {}')
      })

      it('classes instances', () => {
        expect(renderExpr('new Foo()')).to.be.equal('new scope.Foo()')
      })

      it('functions declaration', () => {
        expect(renderExpr('(foo) => bar + foo')).to.be.equal('(foo) => scope.bar + foo')
        expect(renderExpr('(foo) => (bar) => foo + bar + baz')).to.be.equal('(foo) => (bar) => foo + bar + scope.baz')
      })
    })
  })

  describe('Simple bindings', () => {
    it('Multiple expressions will be merged into template literal', () => {
      const source = '<p>{foo} + {bar}</p>'
      const { template } = parse(source)

      expect(mergeNodeExpressions(template.nodes[0])).to.be.equal('`${foo} + ${bar}`')
    })

    it('Complex multiple expressions will be merged into template literal', () => {
      const source = `
      <p>{foo} + {bar}
      foo bar   {baz}
      </p>`
      const { template } = parse(source)

      expect(mergeNodeExpressions(template.nodes[0])).to.be.equal('`${foo} + ${bar}\n      foo bar   ${baz}\n      `')
    })

    it('Simple expressions will be left untouchted', () => {
      const source = '<p>{foo}</p>'
      const { template } = parse(source)

      expect(mergeNodeExpressions(template.nodes[0])).to.be.equal('foo')
    })

    it('Different template brakets will be merged into template literal', () => {
      const source = '<p>[[[[foo]]]] + [[[[bar]]]]</p>'
      const { template } = parse(source, {
        brackets: ['[[[[', ']]]]']
      })

      expect(mergeNodeExpressions(template.nodes[0])).to.be.equal('`${foo} + ${bar}`')
    })

    it('Simple attribute expression', () => {
      const source = '<li class={foo}></li>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const expression = output.expressions[0]

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')

      expect(expression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(expression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.ATTRIBUTE)
      expect(expression[BINDING_NAME_KEY]).to.be.equal('class')
      expect(expression[BINDING_EVALUATE_KEY]({foo: 'foo'})).to.be.equal('foo')
    })

    it('Multiple attribute expressions', () => {
      const source = '<li class={foo} id={bar}></li>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const [classExpression, idExpression] = output.expressions

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')

      expect(classExpression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(classExpression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.ATTRIBUTE)
      expect(classExpression[BINDING_NAME_KEY]).to.be.equal('class')
      expect(classExpression[BINDING_EVALUATE_KEY]({foo: 'foo'})).to.be.equal('foo')

      expect(idExpression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(idExpression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.ATTRIBUTE)
      expect(idExpression[BINDING_NAME_KEY]).to.be.equal('id')
      expect(idExpression[BINDING_EVALUATE_KEY]({bar: 'bar'})).to.be.equal('bar')
    })

    it('Multiple mixed attribute expressions', () => {
      const source = '<input class={foo} value={bar}/>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const [classExpression, valueExpression] = output.expressions

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')

      expect(classExpression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(classExpression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.ATTRIBUTE)
      expect(classExpression[BINDING_NAME_KEY]).to.be.equal('class')
      expect(classExpression[BINDING_EVALUATE_KEY]({foo: 'foo'})).to.be.equal('foo')

      expect(valueExpression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(valueExpression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.VALUE)
      expect(valueExpression[BINDING_EVALUATE_KEY]({bar: 'bar'})).to.be.equal('bar')
    })

    it('Simple value expression', () => {
      const source = '<input value={foo}/>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const expression = output.expressions[0]

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')

      expect(expression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(expression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.VALUE)
      expect(expression[BINDING_EVALUATE_KEY]({foo: 'foo'})).to.be.equal('foo')
    })

    it('Simple event expression', () => {
      const source = '<input oninput={foo}/>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const expression = output.expressions[0]

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')

      expect(expression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(expression[BINDING_NAME_KEY]).to.be.equal('oninput')
      expect(expression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.EVENT)
      expect(expression[BINDING_EVALUATE_KEY]({foo: 'foo'})).to.be.equal('foo')
    })

    it('Complex event expression', () => {
      const source = '<input oninput={() => foo}/>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const expression = output.expressions[0]

      expect(expression[BINDING_EVALUATE_KEY]({foo: 'foo'})()).to.be.equal('foo')
    })

    it('Simple text expression', () => {
      const source = '<div>{foo}</div>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const expression = output.expressions[0]

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')

      expect(expression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(expression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.TEXT)
      expect(expression[BINDING_EVALUATE_KEY]({foo: 'foo'})).to.be.equal('foo')
    })

    it('Multiple text expressions', () => {
      const source = '<div>{foo} + {bar}</div>'
      const { template } = parse(source)
      const input = simpleBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const expression = output.expressions[0]

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(expression[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(expression[BINDING_TYPE_KEY]).to.be.equal(expressionTypes.TEXT)
      expect(expression[BINDING_EVALUATE_KEY]({foo: 'foo', bar: 'bar'})).to.be.equal('foo + bar')
    })
  })


  describe('Tag bindings', () => {
    it('Simple tag binding with default slot', () => {
      const source = '<my-tag class={foo} id="my-id"><p>hello</p></my-tag>'
      const { template } = parse(source)
      const input = tagBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const defaultSlot = output.slots[0]

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.TAG)

      expect(defaultSlot[BINDING_HTML_KEY]).to.be.equal('<p>hello</p>')
      expect(defaultSlot[BINDING_BINDINGS_KEY]).to.be.deep.equal([])
      expect(defaultSlot[BINDING_ID_KEY]).to.be.equal('default')
      expect(output[BINDING_ATTRIBUTES_KEY]).to.have.length(2)
      expect(output[BINDING_ATTRIBUTES_KEY][0][BINDING_EVALUATE_KEY]({foo: 'foo'})).to.be.equal('foo')
      expect(output[BINDING_ATTRIBUTES_KEY][1][BINDING_EVALUATE_KEY]()).to.be.equal('my-id')
    })

    it('Tag binding with default slot with expressions', () => {
      const source = '<my-tag><p>{greeting}</p></my-tag>'
      const { template } = parse(source)
      const input = tagBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const defaultSlot = output.slots[0]

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.TAG)

      expect(removeIdFromExpessionBindings(defaultSlot[BINDING_HTML_KEY]))
        .to.be.equal('<p expr><!----></p>')
      expect(defaultSlot[BINDING_BINDINGS_KEY]).to.have.length(1)
      expect(defaultSlot[BINDING_ID_KEY]).to.be.equal('default')
      expect(output[BINDING_ATTRIBUTES_KEY]).to.have.length(0)
    })

    it('Tag binding with multiple slots with expressions', () => {
      const source = `
        <my-tag>
          <p slot="header">{greeting}</p>
          <b>hey</b>
          <div slot="footer">{footer}</div>
          <i>{there}</i>
        </my-tag>
        `
      const { template } = parse(source)
      const input = tagBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const getSlot = curry(getSlotById)(output.slots)
      const headerSlot = getSlot('header')
      const footerSlot = getSlot('footer')
      const defaultSlot = getSlot('default')

      expect(removeIdFromExpessionBindings(headerSlot[BINDING_HTML_KEY]))
        .to.be.equal('<p expr><!----></p>')
      expect(
        headerSlot[BINDING_BINDINGS_KEY][0][BINDING_EXPRESSIONS_KEY][0][BINDING_EVALUATE_KEY]({greeting: 'hi'}))
        .to.have.be.equal('hi')

      expect(removeIdFromExpessionBindings(footerSlot[BINDING_HTML_KEY]))
        .to.be.equal('<div expr><!----></div>')
      expect(
        footerSlot[BINDING_BINDINGS_KEY][0][BINDING_EXPRESSIONS_KEY][0][BINDING_EVALUATE_KEY]({footer: 'hi'}))
        .to.have.be.equal('hi')

      expect(removeIdFromExpessionBindings(defaultSlot[BINDING_HTML_KEY]))
        .to.be.equal('<b>hey</b><i expr><!----></i>')
      expect(
        defaultSlot[BINDING_BINDINGS_KEY][0][BINDING_EXPRESSIONS_KEY][0][BINDING_EVALUATE_KEY]({there: 'hi'}))
        .to.have.be.equal('hi')
    })
  })

  describe('Each bindings', () => {
    it('Each expression simple', () => {
      const source = '<li expr0 each={item in items}>{item}</li>'
      const { template } = parse(source)
      const input = eachBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_CONDITION_KEY]).to.be.not.ok
      expect(output[BINDING_INDEX_NAME_KEY]).to.be.not.ok
      expect(output[BINDING_GET_KEY_KEY]).to.be.not.ok
      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.EACH)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(output[BINDING_EVALUATE_KEY]({items: [1,2,3]})).to.be.deep.equal([1,2,3])
    })

    it('Each expression with index', () => {
      const source = '<li expr0 each={(item, index) in items}>{item}</li>'
      const { template } = parse(source)
      const input = eachBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_CONDITION_KEY]).to.be.not.ok
      expect(output[BINDING_INDEX_NAME_KEY]).to.be.equal('index')
      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.EACH)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(output[BINDING_EVALUATE_KEY]({items: [1,2,3]})).to.be.deep.equal([1,2,3])
    })

    it('Each expression with condition index', () => {
      const source = '<li expr0 each={(item, index) in items} if={item > 1}>{item}</li>'
      const { template } = parse(source)
      const input = eachBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_CONDITION_KEY]).to.be.ok
      expect(output[BINDING_CONDITION_KEY]({item: 2})).to.be.ok
      expect(output[BINDING_INDEX_NAME_KEY]).to.be.equal('index')
      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.EACH)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(output[BINDING_EVALUATE_KEY]({items: [1,2,3]})).to.be.deep.equal([1,2,3])
    })

    it('Each expression with key attribute', () => {
      const source = '<li expr0 each={(item, index) in items} key={item} if={item > 1}>{item}</li>'
      const { template } = parse(source)
      const input = eachBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_CONDITION_KEY]).to.be.ok
      expect(output[BINDING_CONDITION_KEY]({item: 2})).to.be.ok
      expect(output[BINDING_GET_KEY_KEY]({item: 2})).to.be.equal(2)
      expect(output[BINDING_INDEX_NAME_KEY]).to.be.equal('index')
      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.EACH)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(output[BINDING_EVALUATE_KEY]({items: [1,2,3]})).to.be.deep.equal([1,2,3])
    })

    it('Each complex expression', () => {
      const source = '<li expr0 each={(item, index) in items()}>{item}</li>'
      const { template } = parse(source)
      const input = eachBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)
      const items = () => [1, 2, 3]

      expect(output[BINDING_CONDITION_KEY]).to.be.not
      expect(output[BINDING_INDEX_NAME_KEY]).to.be.equal('index')
      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.EACH)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(output[BINDING_EVALUATE_KEY]({items})).to.be.deep.equal([1,2,3])
    })

    it('Each cast a string attribute to expression', () => {
      const source = '<li expr0 each="(item, index) in items" if="item > 1">{item}</li>'
      const { template } = parse(source)
      const input = eachBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_CONDITION_KEY]).to.be.ok
      expect(output[BINDING_CONDITION_KEY]({item: 2})).to.be.ok
      expect(output[BINDING_INDEX_NAME_KEY]).to.be.equal('index')
      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.EACH)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(output[BINDING_EVALUATE_KEY]({items: [1,2,3]})).to.be.deep.equal([1,2,3])
    })

    it('Each binding on custom tag', () => {
      const source = '<my-tag expr0 each="(item, index) in items">{item}</my-tag>'
      const { template } = parse(source)
      const input = eachBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_INDEX_NAME_KEY]).to.be.equal('index')
      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.EACH)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')
      expect(output[BINDING_EVALUATE_KEY]({items: [1,2,3]})).to.be.deep.equal([1,2,3])
    })
  })

  describe('If bindings', () => {
    it('If expression false', () => {
      const source = '<p expr0 if={1 > 2}>Hello</p>'
      const { template } = parse(source)
      const input = ifBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.IF)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')

      expect(output[BINDING_EVALUATE_KEY]()).to.be.equal(false)
    })

    it('If expression on custom tag', () => {
      const source = '<my-tag expr0 if={1 > 2}>Hello</my-tag>'
      const { template } = parse(source)
      const input = ifBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.IF)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')

      expect(output[BINDING_EVALUATE_KEY]()).to.be.equal(false)
    })

    it('If expression truthy', () => {
      const source = '<p expr0 if={"foo bar"}>Hello</p>'
      const { template } = parse(source)
      const input = ifBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.IF)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')

      expect(output[BINDING_EVALUATE_KEY]()).to.be.equal('foo bar')
    })

    it('If expression nested object', () => {
      const source = '<p expr0 if={opts.isVisible}>Hello</p>'
      const { template } = parse(source)
      const input = ifBinding(template, 'expr0', FAKE_SRC_FILE, source)
      const output = evaluateOutput(input)

      expect(output[BINDING_SELECTOR_KEY]).to.be.equal('[expr0]')
      expect(output[BINDING_TYPE_KEY]).to.be.equal(bindingTypes.IF)
      expect(output[BINDING_TEMPLATE_KEY]).to.be.a('object')
      expect(output[BINDING_EVALUATE_KEY]).to.be.a('function')

      expect(output[BINDING_EVALUATE_KEY]({ opts: {
        isVisible: false
      }})).to.be.equal(false)
    })
  })

  describe('Template builder', () => {
    it('Throw in case of no template to parse', () => {
      expect(() => builder(null)).to.throw
    })

    it('No template no party', () => {
      const [html] = builder({}, FAKE_SRC_FILE, '')
      expect(html).to.be.equal('')
    })

    it('Simple node', () => {
      const source = '<p>foo bar</p>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal(source)
    })

    it('Simple text expression', () => {
      const source = '<p>your {name}</p>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<p expr><!----></p>')
    })

    it('Multiple text expressions', () => {
      const source = '<p>{user} {name}</p>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<p expr><!----></p>')
    })

    it('Boolean attribute', () => {
      const source = '<video loop muted></video>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal(source)
    })

    /*
    COMING SOON...
    it('Spread attribute', () => {
      const source = '<div {...foo.bar}></div>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<div></div>')
    })
    */

    it('Static attribute', () => {
      const source = '<video class="hello"></video>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal(source)
    })

    it('Simple if binding', () => {
      const source = '<p if={foo}>foo bar</p>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<p expr></p>')
    })

    it('Simple each binding', () => {
      const source = '<p each={item in items}>{item}</p>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<p expr></p>')
    })

    it('Each and if binding on the same tag', () => {
      const source = '<p each={item in items} if={foo}>{item}</p>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<p expr></p>')
    })

    it('Simple void tag', () => {
      const source = '<input/>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal(source)
    })

    it('You don\'t know HTML, void tags correction', () => {
      const source = '<img></img>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<img/>')
    })

    it('Simple tag binding', () => {
      const source = '<my-tag>foo bar</my-tag>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<my-tag expr></my-tag>')
    })

    it('Nested list', () => {
      const source = '<ul><li>1</li><li>2</li><li>3</li></ul>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal(source)
    })

    it('Nested list with expression', () => {
      const source = '<ul><li>1</li><li>{two}</li><li>3</li></ul>'
      const { template } = parse(source)
      const html = buildSimpleTemplate(template, FAKE_SRC_FILE, source)

      expect(html).to.be.equal('<ul><li>1</li><li expr><!----></li><li>3</li></ul>')
    })
  })
})