import * as fs from 'fs';
import * as path from 'path';
import * as $RefParser from '@apidevtools/json-schema-ref-parser';
import { OpenAPISchemaValidator } from './openapi.schema.validator';
import { BasePath } from './base.path';
import {
  OpenAPIFrameworkArgs,
  OpenAPIFrameworkInit,
  OpenAPIFrameworkVisitor,
  OpenAPIV3,
} from './types';

export class OpenAPIFramework {
  private readonly args: OpenAPIFrameworkArgs;
  private readonly loggingPrefix: string = 'openapi.validator: ';

  constructor(args: OpenAPIFrameworkArgs) {
    this.args = args;
  }

  public async initialize(
    visitor: OpenAPIFrameworkVisitor,
  ): Promise<OpenAPIFrameworkInit> {
    const args = this.args;
    const apiDoc = await this.loadSpec(args.apiDoc);

    const basePathObs = this.getBasePathsFromServers(apiDoc.servers);
    const basePaths = Array.from(
      basePathObs.reduce((acc, bp) => {
        bp.all().forEach((path) => acc.add(path));
        return acc;
      }, new Set<string>()),
    );
    const validateApiSpec =
      'validateApiSpec' in args ? !!args.validateApiSpec : true;
    const validator = new OpenAPISchemaValidator({
      version: apiDoc.openapi,
      validateApiSpec
    });

    if (validateApiSpec) {
      const apiDocValidation = validator.validate(apiDoc);

      if (apiDocValidation.errors.length) {
        console.error(`${this.loggingPrefix}Validating schema`);
        console.error(
          `${this.loggingPrefix}validation errors`,
          JSON.stringify(apiDocValidation.errors, null, '  '),
        );
        throw new Error(
          `${this.loggingPrefix}args.apiDoc was invalid.  See the output.`,
        );
      }
    }
    const getApiDoc = () => {
      return apiDoc;
    };

    this.sortApiDocTags(apiDoc);

    if (visitor.visitApi) {
      // const basePaths = basePathObs;
      visitor.visitApi({
        basePaths,
        getApiDoc,
      });
    }
    return {
      apiDoc,
      basePaths,
    };
  }

  private loadSpec(
    filePath: string | object,
  ): Promise<OpenAPIV3.Document> {
    if (typeof filePath === 'string') {
      const origCwd = process.cwd();
      const absolutePath = path.resolve(origCwd, filePath);
      if (fs.existsSync(absolutePath)) {
        // Get document, or throw exception on error
        return $RefParser.dereference(absolutePath);
      } else {
        throw new Error(
          `${this.loggingPrefix}spec could not be read at ${filePath}`,
        );
      }
    }
    return $RefParser.dereference(filePath);
  }

  private sortApiDocTags(apiDoc: OpenAPIV3.Document): void {
    if (apiDoc && Array.isArray(apiDoc.tags)) {
      apiDoc.tags.sort((a, b): number => {
        return a.name < b.name ? -1 : 1;
      });
    }
  }

  private getBasePathsFromServers(
    servers: OpenAPIV3.ServerObject[],
  ): BasePath[] {
    if (!servers || servers.length === 0) {
      return [new BasePath({ url: '' })];
    }
    const basePathsMap: { [key: string]: BasePath } = {};
    for (const server of servers) {
      const basePath = new BasePath(server);
      basePathsMap[basePath.expressPath] = basePath;
    }
    return Object.keys(basePathsMap).map((key) => basePathsMap[key]);
  }
}
