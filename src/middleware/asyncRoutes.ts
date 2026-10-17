import { Application } from 'express';

/** Express 4 does not forward rejected promises from async route handlers. */
export function wrapAsyncRoutes(router: Application) {
    const stack = (router as any)._router?.stack || [];
    for (const layer of stack) {
        if (!layer.route?.stack) continue;
        for (const routeLayer of layer.route.stack) {
            const handler = routeLayer.handle;
            if (handler.__asyncErrorsWrapped) continue;
            const wrapped = function (this: unknown, req: unknown, res: unknown, next: (error?: unknown) => void) {
                try {
                    const result = handler.call(this, req, res, next);
                    if (result && typeof result.then === 'function') result.catch(next);
                    return result;
                } catch (error) {
                    return next(error);
                }
            };
            (wrapped as any).__asyncErrorsWrapped = true;
            routeLayer.handle = wrapped;
        }
    }
}
