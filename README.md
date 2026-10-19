# apex3d-bolivia.github.io
Página web de APEx3D

## Panel privado de pedidos

La pestaña **Pedidos** abre `pedidos.html` y ofrece vistas de **Lista** y **Calendario**. El panel usa Supabase Auth, una tabla con políticas RLS y un bucket privado para las fotografías. La lista de permitidos admite como máximo tres correos. No hay registro público: las cuentas se invitan desde el panel de Supabase.

### Preparar Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/) y conserva sus credenciales del proyecto.
2. En **SQL Editor**, abre y ejecuta todo el archivo [`supabase/schema.sql`](./supabase/schema.sql). Este crea la lista de permitidos, impone el máximo de tres cuentas, configura la tabla y sus políticas RLS y crea el bucket privado de fotografías.
3. En el mismo SQL Editor, agrega los tres correos autorizados, en minúsculas, sustituyendo estos ejemplos por los correos reales. No guardes los correos en el repositorio:

   ```sql
   insert into public.allowed_users (email) values ('primer-correo@example.com');
   insert into public.allowed_users (email) values ('segundo-correo@example.com');
   insert into public.allowed_users (email) values ('tercer-correo@example.com');
   ```

   La base de datos rechazará una cuarta cuenta permitida.
4. En **Authentication → Sign In / Providers**, habilita el inicio de sesión por correo y contraseña y desactiva los registros públicos. En **Authentication → URL Configuration**, configura la URL pública de GitHub Pages como **Site URL** y agrega `https://apex3d-bolivia.github.io/pedidos.html` como URL de redirección (incluye también el dominio propio si lo utilizas).
5. En **Authentication → Users**, invita únicamente a esos tres correos. Al aceptar la invitación, cada persona puede usar **Cambiar contraseña** dentro del panel para definir su contraseña. La pantalla de inicio también ofrece recuperación por correo.
6. En **Project Settings → API**, copia el **Project URL** y la clave pública **publishable/anon** en `supabase-config.js`, en `url` y `anonKey`. Esa clave pública forma parte del sitio web; nunca pongas la `service_role` key ni otro secreto en este repositorio.
7. Abre `pedidos.html` mediante HTTPS en GitHub Pages e inicia sesión. Sube `index.html`, `pedidos.html`, `pedidos.js`, `supabase-config.js`, `supabase/schema.sql` y el resto del sitio al repositorio.

La base de datos y el bucket se protegen en el servidor con políticas RLS; la lista de cuentas no es visible ni modificable desde el navegador. Los tres usuarios autorizados comparten los pedidos y pueden gestionarlos. Los registros creados con la versión local anterior siguen en el almacenamiento del navegador donde se introdujeron: inicia sesión desde ese mismo navegador y usa **Importar pedidos de este navegador** para copiarlos a Supabase. La importación pide confirmación y no borra los originales.
