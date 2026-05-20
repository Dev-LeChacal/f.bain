import "package:frontend/routing/routes.dart";
import "package:go_router/go_router.dart";

final router = GoRouter(
  initialLocation: Routes.upload,

  routes: [
    GoRoute(path: Routes.upload),
    GoRoute(path: Routes.download),
  ],
);
