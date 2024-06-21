import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { PromptTemplate } from '@langchain/core/prompts'
import { API_RESPONSE_RAW_PROMPT_TEMPLATE, API_URL_RAW_PROMPT_TEMPLATE, APIChain } from './getCore'
import { ConsoleCallbackHandler, CustomChainHandler, additionalCallbacks } from '../../../src/handler'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getBaseClasses } from '../../../src/utils'
import { BaseLLMOutputParser, BaseOutputParser } from '@langchain/core/output_parsers'
import { OutputFixingParser } from 'langchain/output_parsers'

class ParsedGETApiChain_Chains implements INode {
    label: string
    name: string
    version: number
    type: string
    icon: string
    category: string
    baseClasses: string[]
    description: string
    inputs: INodeParams[]
    outputParser: BaseLLMOutputParser

    constructor() {
        this.label = 'Parsed GET API Chain'
        this.name = 'ParsedgetApiChain'
        this.version = 1.0
        this.type = 'ParsedGETApiChain'
        this.icon = 'get.svg'
        this.category = 'Chains'
        this.description = 'Output Parser Integrated-Chain to run queries against GET API'
        this.baseClasses = [this.type, ...getBaseClasses(APIChain)]
        this.inputs = [
            {
                label: 'Language Model',
                name: 'model',
                type: 'BaseLanguageModel'
            },
            {
                label: 'Output Parser',
                name: 'outputParser',
                type: 'BaseLLMOutputParser',
                optional: true
            },
            {
                label: 'API Documentation',
                name: 'apiDocs',
                type: 'string',
                description:
                    'Description of how API works. Please refer to more <a target="_blank" href="https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/chains/api/open_meteo_docs.py">examples</a>',
                rows: 4
            },
            {
                label: 'Headers',
                name: 'headers',
                type: 'json',
                additionalParams: true,
                optional: true
            },
            {
                label: 'URL Prompt',
                name: 'urlPrompt',
                type: 'string',
                description: 'Prompt used to tell LLMs how to construct the URL. Must contains {api_docs} and {question}',
                default: API_URL_RAW_PROMPT_TEMPLATE,
                rows: 4,
                additionalParams: true
            },
            {
                label: 'Answer Prompt',
                name: 'ansPrompt',
                type: 'string',
                description:
                    'Prompt used to tell LLMs how to return the API response. Must contains {api_response}, {api_url}, and {question}',
                default: API_RESPONSE_RAW_PROMPT_TEMPLATE,
                rows: 4,
                additionalParams: true
            }
        ]
    }

    async init(nodeData: INodeData): Promise<any> {
        const model = nodeData.inputs?.model as BaseLanguageModel
        const apiDocs = nodeData.inputs?.apiDocs as string
        const headers = nodeData.inputs?.headers as string
        const urlPrompt = nodeData.inputs?.urlPrompt as string
        const ansPrompt = nodeData.inputs?.ansPrompt as string
        const outputParser = nodeData.inputs?.outputParser as BaseLLMOutputParser

        if (outputParser) {
            let autoFix = (outputParser as any).autoFix
            if (autoFix === true) {
                this.outputParser = OutputFixingParser.fromLLM(model, outputParser as BaseOutputParser)
            } else {
                this.outputParser = outputParser
            }
        }

        const chain = await getAPIChain(apiDocs, model, outputParser as BaseOutputParser, headers, urlPrompt, ansPrompt)
        return chain
    }

    async run(nodeData: INodeData, input: string, options: ICommonObject): Promise<string | object> {
        const model = nodeData.inputs?.model as BaseLanguageModel
        const apiDocs = nodeData.inputs?.apiDocs as string
        const headers = nodeData.inputs?.headers as string
        const urlPrompt = nodeData.inputs?.urlPrompt as string
        const ansPrompt = nodeData.inputs?.ansPrompt as string
        const outputParser = nodeData.inputs?.outputParser as BaseLLMOutputParser

        const chain = await getAPIChain(apiDocs, model, outputParser, headers, urlPrompt, ansPrompt)
        const loggerHandler = new ConsoleCallbackHandler(options.logger)
        const callbacks = await additionalCallbacks(nodeData, options)

        if (!this.outputParser && outputParser) {
            this.outputParser = outputParser
        }

        if (options.socketIO && options.socketIOClientId) {
            const handler = new CustomChainHandler(options.socketIO, options.socketIOClientId, 2)
            const res = await chain.run(input, [loggerHandler, handler, ...callbacks])
            return res
        } else {
            const res = await chain.run(input, [loggerHandler, ...callbacks])
            return res
        }
    }
}

const getAPIChain = async (
    documents: string,
    llm: BaseLanguageModel,
    outputParser: BaseLLMOutputParser,
    headers: string,
    urlPrompt: string,
    ansPrompt: string
) => {
    const apiUrlPrompt = new PromptTemplate({
        inputVariables: ['api_docs', 'question'],
        template: urlPrompt ? urlPrompt : API_URL_RAW_PROMPT_TEMPLATE
    })

    const apiResponsePrompt = new PromptTemplate({
        inputVariables: ['api_docs', 'question', 'api_url_body', 'api_response'],
        template: ansPrompt ? ansPrompt : API_RESPONSE_RAW_PROMPT_TEMPLATE
    })

    const chain = APIChain.fromLLMAndAPIDocs(llm, documents, {
        apiUrlPrompt,
        apiResponsePrompt,
        verbose: process.env.DEBUG === 'true' ? true : false,
        headers: typeof headers === 'object' ? headers : headers ? JSON.parse(headers) : {},
        outputParser
    })
    return chain
}

module.exports = { nodeClass: ParsedGETApiChain_Chains }