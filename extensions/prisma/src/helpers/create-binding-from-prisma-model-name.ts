import {Binding} from '@loopback/core';
import {PrismaBindings} from '../keys';

export function createBindingFromPrismaModelName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelObj: any,
  modelName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Binding<any> {
  return new Binding(`${PrismaBindings.PRISMA_MODEL_NAMESPACE}.${modelName}`)
    .to(modelObj)
    .tag(PrismaBindings.PRISMA_MODEL_TAG);
}
