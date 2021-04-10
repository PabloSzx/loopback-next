import {PrismaClient} from '.prisma/client';
import {Application} from '@loopback/core';
import {sinon} from '@loopback/testlab';
import assert from 'assert';
import {PrismaComponent} from '../..';

describe('Prisma Component', () => {
  let app: Application;

  beforeEach(() => {
    app = new Application();
  });

  it('calls PrismaClient.$connect() during lifecycle start', async () => {
    const prismaClientStub = sinon.stub(new PrismaClient());
    const component = new PrismaComponent(
      app,
      (<unknown>prismaClientStub) as PrismaClient,
    );
    component.init();
    await component.start();
    assert(prismaClientStub.$connect.calledOnce);
  });

  it('does not call PrismaClient.$connect during lifecycle start when lazyConnect = true', async () => {
    const prismaClientStub = sinon.stub(new PrismaClient());
    const component = new PrismaComponent(
      app,
      (<unknown>prismaClientStub) as PrismaClient,
      {
        lazyConnect: true,
      },
    );
    component.init();
    await component.start();
    assert(prismaClientStub.$connect.notCalled);
  });

  it('calls PrismaClient.$disconnect during lifecycle stop', async () => {
    const prismaClientStub = sinon.stub(new PrismaClient());
    const component = new PrismaComponent(
      app,
      (<unknown>prismaClientStub) as PrismaClient,
    );
    component.init();
    await component.stop();
    assert(prismaClientStub.$disconnect.calledOnce);
  });

  it('Sets isInitialized after init() is called.', async () => {
    const prismaClientStub = sinon.stub(new PrismaClient());
    const component = new PrismaComponent(
      app,
      (<unknown>prismaClientStub) as PrismaClient,
    );
    component.init();
    assert(component.isInitialized === true);
  });
});
