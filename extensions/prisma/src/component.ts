// Copyright IBM Corp. 2021. All Rights Reserved.
// Node module: @loopback/prisma
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {
  Application,
  Binding,
  BindingCreationPolicy,
  BindingScope,
  BindingType,
  Component,
  config,
  configBindingKeyFor,
  ContextTags,
  CoreBindings,
  inject,
  LifeCycleObserver,
  lifeCycleObserver,
} from '@loopback/core';
import {Prisma, PrismaClient} from '@prisma/client';
import {PrismaClientNotSingletonError} from './errors/';
import {createBindingFromPrismaModelName} from './helpers/';
import {PrismaBindings as PrismaBindings} from './keys';
import {DEFAULT_PRISMA_OPTIONS, PrismaOptions} from './types';

const componentConfigBindingKey = configBindingKeyFor<PrismaOptions>(
  PrismaBindings.COMPONENT,
);

/**
 * The component used to register the necessary artifacts for Prisma integration
 * with LoopBack 4.
 *
 * @remarks
 * This component was designed to be registered with
 * {@link Application.component} or used standalone—This is to enable more
 * complex use-cases and easier testing.
 *
 * Check the {@link PrismaComponent:constructor} tsdoc for in-depth
 * documentation on instances.
 *
 * @decorator
 * ```typescript
 * @lifeCycleObserver('datasource', {
 *   tags: {[ContextTags.KEY]: PrismaBindings.COMPONENT},
 *   scope: BindingScope.SINGLETON,
 * })
 * ```
 */
@lifeCycleObserver('datasource', {
  tags: {[ContextTags.KEY]: PrismaBindings.COMPONENT},
  scope: BindingScope.SINGLETON,
})
export class PrismaComponent implements Component, LifeCycleObserver {
  @inject.binding(componentConfigBindingKey, {
    bindingCreation: BindingCreationPolicy.CREATE_IF_NOT_BOUND,
  })
  private _optionsBinding: Binding<PrismaOptions>;
  private _isInitialized = false;

  /**
   * Returns `true` if {@link PrismaComponent.init} has been called.
   *
   * @remarks
   * This is useful for ensuring that {@link PrismaComponent.init} is called
   * exactly once outside of {@link @loopback/core#LifeCycleObserverRegistry}
   * (e.g. as a prerequisite before calling {@link PrismaComponent.start}).
   */
  get isInitialized() {
    return this._isInitialized;
  }

  /**
   * @remarks
   * ## Providing custom PrismaClient
   * It is possible to provide a custom PrismaClient instance by either:
   *
   * - Providing a {@link @prisma/client#PrismaClient} instance into the
   *     constructor.
   * - Binding a {@link @prisma/client#PrismaClient} instance to
   *     {@link PrismaBindings.PRISMA_CLIENT_INSTANCE} before
   *     {@link PrismaComponent.init}.
   *
   * If a {@link @prisma/client#PrismaClient} instance is provided through the
   * constructor but not bound to context, a new binding will be created for
   * that instance.
   *
   * Note that if a {@link @prisma/client#PrismaClient} instance is provided
   * through both aforementioned methods, they must reference the same instance.
   * Otherwise, an error will be thrown when {@link PrismaComponent:constructor}
   * or {@link PrismaComponent.start} is called.
   *
   * ## Post-initialization restrictions
   * After `init()` is successfully called, the following scenarios will throw
   * an error:
   *
   * - Calling {@link PrismaComponent.init} again.
   *
   * Furthermore, the following scenarios will not be ignored by the component:
   *
   * - Manipulating {@link PrismaBindings.COMPONENT} configuration binding.
   * - Manipulating {@link PrismaBindings.PRISMA_CLIENT_INSTANCE} binding.
   *
   * Furthermore, the following bindings will be locked:
   *
   * - Configuration binding key of {@link PrismaBindings.COMPONENT}
   * - {@link PrismaBindings.PRISMA_CLIENT_INSTANCE}
   *
   * These restrictions are in place as {@link @prisma/client#PrismaClient}
   * would have already been initialized.
   *
   * ## De-initialization
   * To de-initialize, replace the current instance with a new instance.
   *
   * @param _application An instance of a generic or specialized
   * {@link @loopback/core#Application}.
   * @param _prismaClient An instance of {@link @prisma/client#PrismaClient}.
   * @param _options Initial component and {@link @prisma/client#PrismaClient}
   * configuration.
   */
  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE)
    private _application: Application,
    @inject(PrismaBindings.PRISMA_CLIENT_INSTANCE, {optional: true})
    private _prismaClient?: PrismaClient,
    @config()
    private _options: PrismaOptions = DEFAULT_PRISMA_OPTIONS,
  ) {
    this._ensureNoConflictingPrismaProvidedAndBound();
    if (!this._application.isBound(componentConfigBindingKey))
      this._optionsBinding = this._application
        .bind(componentConfigBindingKey)
        .to(this._options);
    else if (!this._optionsBinding)
      // A workaround as BindingCreationPolicy.CREATE_IF_NOT_BOUND does not
      // return a binding.
      this._optionsBinding = this._application.getBinding(
        componentConfigBindingKey,
      );
  }

  /**
   * Checks if a conflicting instance of Prisma is provided in the constructor
   * and bound to context.
   *
   * @returns `undefined` if the {@link @prisma/client#PrismaClient} instance
   * referenced in the constructor and binding are identical.
   */
  private _ensureNoConflictingPrismaProvidedAndBound() {
    if (
      this._prismaClient &&
      this._application.getBinding(PrismaBindings.PRISMA_CLIENT_INSTANCE, {
        optional: true,
      }) &&
      this._prismaClient !==
        this._application.getSync(PrismaBindings.PRISMA_CLIENT_INSTANCE)
    ) {
      throw new Error(
        'An Prisma Client instance was provided whilst a different instance was bound to context.',
      );
    }
    return;
  }

  /**
   * Initializes PrismaClient, if needed.
   *
   * @remarks
   * Calling this function will lock PrismaClient and configuration.
   *
   * If the component instance is already initialized, this function will be a
   * no-op.
   *
   * @returns `undefined`.
   */
  init() {
    if (this._isInitialized) return;

    this._ensureNoConflictingPrismaProvidedAndBound();

    if (this._prismaClient) {
      const prismaClientBinding = this._application.getBinding(
        PrismaBindings.PRISMA_CLIENT_INSTANCE,
        {optional: true},
      );

      if (!prismaClientBinding)
        this._application
          .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
          .to(this._prismaClient)
          .inScope(BindingScope.SINGLETON);
      else if (prismaClientBinding.scope !== BindingScope.SINGLETON)
        throw new PrismaClientNotSingletonError();
      else if (prismaClientBinding.type !== BindingType.CONSTANT) {
        throw new Error('Prisma Client instance binding type not constant.');
      }
    } else {
      // Late refresh of Prisma options cache.
      this._options = this._application.getSync(componentConfigBindingKey);

      const {prismaClient: prismaOptions} = this._options;
      this._prismaClient = new PrismaClient(prismaOptions);
      this._application
        .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
        .to(this._prismaClient)
        .inScope(BindingScope.SINGLETON);
    }

    const prismaClientBinding = this._application.getBinding(
      PrismaBindings.PRISMA_CLIENT_INSTANCE,
    );

    // Lock the these bindings as changes after initialization are not
    // supported.
    this._optionsBinding.lock();
    prismaClientBinding.lock();

    // Bind models
    for (const modelName in Prisma.ModelName) {
      this._application.add(
        createBindingFromPrismaModelName(
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this._prismaClient[modelName.toLowerCase()],
          modelName,
        ),
      );
    }

    this._isInitialized = true;
  }

  /**
   * Start Prisma datasource connections, if needed.
   *
   * @remarks
   * {@link PrismaComponent.init} must be called as a prerequisite.
   *
   * If {@link PrismaOptions.lazyConnect} is `true`,
   * {@link @prisma/client#PrismaClient.$connect} is called. Otherwise, this is
   * a no-op
   * function.
   *
   * @returns `undefined` if {@link PrismaOptions.lazyConnect} is `true`, else
   * {@link @prisma/client#PrismaClient.$connect} promise.
   */
  start() {
    if (!this._isInitialized) throw new Error('Component must be initialized!');
    if (this._options.lazyConnect) return;
    return this._prismaClient!.$connect();
  }

  /**
   * Stops Prisma datasource connections.
   *
   * @remarks
   * {@link PrismaComponent.init} must be called as a prerequisite.
   *
   * @returns return value from {@link @prisma/client#PrismaClient.$disconnect}.
   */
  stop() {
    if (!this._isInitialized) throw new Error('Component must be initialized!');
    return this._prismaClient!.$disconnect();
  }
}
