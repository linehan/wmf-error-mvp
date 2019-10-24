function three()
{
        throw new Error("yep hi");
}

function three()
{
        three();
}

function one()
{
        two();
}


window.onload = function() {

        T_T.replace_window_onerror_handler();

        document.getElementById("clicker").addEventListener("click", function(e) {
                one();
        });
}

